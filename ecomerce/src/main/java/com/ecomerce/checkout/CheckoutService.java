package com.ecomerce.checkout;

import com.ecomerce.cart.CartService;
import com.ecomerce.common.observability.RequestIdFilter;
import com.ecomerce.dto.OrderRequest;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.DeliveryZone;
import com.ecomerce.entity.Order;
import com.ecomerce.entity.OrderItem;
import com.ecomerce.entity.Product;
import com.ecomerce.entity.User;
import com.ecomerce.exception.CheckoutInProgressException;
import com.ecomerce.exception.InsufficientStockException;
import com.ecomerce.exception.PriceChangedException;
import com.ecomerce.exception.ProductUnavailableException;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.messaging.event.OrderCreatedEvent;
import com.ecomerce.messaging.outbox.OutboxService;
import com.ecomerce.repository.OrderRepository;
import com.ecomerce.repository.ProductRepository;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.service.DeliveryZoneService;
import com.ecomerce.service.IdempotencyService;
import com.ecomerce.service.ProductCacheService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Transaction-safe, idempotent checkout.
 *
 * <ol>
 *   <li>Normalise the request (merge duplicate lines) and hash it.</li>
 *   <li>Claim the idempotency key in its own committed transaction. A completed key returns
 *       the original order; a running one returns CHECKOUT_IN_PROGRESS.</li>
 *   <li>In ONE database transaction: load current products, reject inactive items and
 *       price changes, decrement stock with conditional updates in ascending product-ID
 *       order, insert the order and item snapshots, insert the ORDER_CREATED outbox event,
 *       and mark the key SUCCEEDED. Any failure rolls all of it back.</li>
 *   <li>On failure, mark the key FAILED so the same attempt can be retried.</li>
 * </ol>
 *
 * No network call (email, payment, messaging) happens inside the transaction. Redis is not
 * consulted: stock, prices and totals come only from PostgreSQL.
 */
@Service
@Slf4j
public class CheckoutService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final DeliveryZoneService deliveryZoneService;
    private final IdempotencyService idempotencyService;
    private final OutboxService outboxService;
    private final ProductCacheService productCacheService;
    private final CartService cartService;
    private final TransactionTemplate tx;

    @Value("${app.cart.max-quantity-per-item:99}")
    private int maxQuantityPerItem = 99;

    public CheckoutService(OrderRepository orderRepository, ProductRepository productRepository,
                           UserRepository userRepository, DeliveryZoneService deliveryZoneService,
                           IdempotencyService idempotencyService, OutboxService outboxService,
                           ProductCacheService productCacheService, CartService cartService,
                           PlatformTransactionManager transactionManager) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.deliveryZoneService = deliveryZoneService;
        this.idempotencyService = idempotencyService;
        this.outboxService = outboxService;
        this.productCacheService = productCacheService;
        this.cartService = cartService;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public OrderResponse placeOrder(Long userId, OrderRequest request) {
        String key = request.getIdempotencyKey() == null ? "" : request.getIdempotencyKey().trim();
        if (key.length() < 8) {
            throw new IllegalArgumentException(
                    "A checkout attempt key is required. Refresh the checkout page and try again.");
        }
        Map<Long, Line> lines = normalise(request);
        String requestHash = idempotencyService.calculateRequestHash(request);

        IdempotencyService.Claim claim = idempotencyService.claim(userId, key, requestHash);
        if (!claim.owned()) {
            return loadOwnOrder(claim.existingOrderId(), userId);
        }

        try {
            OrderResponse response = tx.execute(status -> createOrder(userId, key, request, lines));
            log.info("Order {} placed by user {}", response.getId(), userId);
            return response;
        } catch (DataIntegrityViolationException e) {
            // orders.idempotency_key is UNIQUE. If an earlier attempt with this key did commit
            // (e.g. its response was lost after commit), return that order instead of a 2nd one.
            Optional<Order> existing = orderRepository.findByIdempotencyKey(key)
                    .filter(o -> o.getUser() != null && userId.equals(o.getUser().getId()));
            if (existing.isPresent()) {
                idempotencyService.markSucceeded(userId, key, existing.get().getId());
                return loadOwnOrder(existing.get().getId(), userId);
            }
            idempotencyService.markFailed(userId, key);
            throw e;
        } catch (RuntimeException e) {
            idempotencyService.markFailed(userId, key);
            throw e;
        }
    }

    // ─── The order transaction ──────────────────────────────────────────────

    private OrderResponse createOrder(Long userId, String key, OrderRequest request, Map<Long, Line> lines) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        DeliveryZone zone = deliveryZoneService.resolveZone(request.getDeliveryZoneId());

        // Load every product once, in ascending ID order (TreeMap keys).
        Map<Long, Product> products = productRepository.findAllById(lines.keySet()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));

        List<ProductResponse> changedProducts = new ArrayList<>();
        List<PriceChangedException.PriceChange> changes = new ArrayList<>();
        for (Line line : lines.values()) {
            Product product = products.get(line.productId());
            if (product == null) {
                throw ResourceNotFoundException.product(line.productId());
            }
            if (!Boolean.TRUE.equals(product.getActive())) {
                throw new ProductUnavailableException(product.getId(), product.getName());
            }
            BigDecimal cargo = product.getCargoPrice() == null ? BigDecimal.ZERO : product.getCargoPrice();
            boolean priceDiffers = line.expectedUnitPrice() != null
                    && product.getPrice().compareTo(line.expectedUnitPrice()) != 0;
            boolean cargoDiffers = line.expectedCargoPrice() != null
                    && cargo.compareTo(line.expectedCargoPrice()) != 0;
            if (priceDiffers || cargoDiffers) {
                changedProducts.add(ProductResponse.from(product));
                changes.add(new PriceChangedException.PriceChange(product.getId(), product.getName(),
                        line.expectedUnitPrice(), product.getPrice(), line.expectedCargoPrice(), cargo));
            }
        }
        if (!changes.isEmpty()) {
            // Nothing has been written yet; the transaction simply rolls back.
            throw new PriceChangedException(changedProducts, changes);
        }

        // Atomic conditional decrements, ascending ID order to avoid deadlocks.
        for (Line line : lines.values()) {
            if (productRepository.decrementStock(line.productId(), line.quantity()) == 0) {
                throw explainFailedDecrement(products.get(line.productId()), line.quantity());
            }
        }

        // Snapshots: name and prices as charged; later product edits never change them.
        List<OrderItem> items = new ArrayList<>();
        List<PricingCalculator.Line> pricing = new ArrayList<>();
        for (Line line : lines.values()) {
            Product product = products.get(line.productId());
            PricingCalculator.Line priced = new PricingCalculator.Line(
                    product.getPrice(), product.getCargoPrice(), line.quantity());
            pricing.add(priced);
            items.add(OrderItem.builder()
                    .product(product)
                    .productName(product.getName())
                    .productImageUrl(product.getImageUrl())
                    .unitPrice(product.getPrice())
                    .cargoPrice(product.getCargoPrice() == null ? BigDecimal.ZERO : product.getCargoPrice())
                    .quantity(line.quantity())
                    .lineTotal(priced.lineSubtotal())
                    .build());
        }
        PricingCalculator.Totals totals = PricingCalculator.totals(pricing, zone.getFee());

        Order order = Order.builder()
                .user(user)
                .customerName(request.getCustomerName().trim())
                .customerPhone(request.getCustomerPhone().trim())
                .deliveryAddress(request.getCustomDeliveryAddress().trim())
                .townName(zone.getTownName())
                .deliveryFee(totals.deliveryFee())
                .subtotal(totals.subtotal())
                .cargoTotal(totals.cargoTotal())
                .total(totals.total())
                .status(Order.OrderStatus.PENDING)
                .idempotencyKey(key)
                .build();
        items.forEach(item -> item.setOrder(order));
        order.setOrderItems(items);
        Order saved = orderRepository.saveAndFlush(order);

        outboxService.recordOrderCreated(OrderCreatedEvent.of(
                UUID.randomUUID(), saved.getId(), userId, OffsetDateTime.now(), RequestIdFilter.currentRequestId()));

        if (!idempotencyService.markSucceededInCurrentTransaction(userId, key, saved.getId())) {
            // Another request reclaimed this key as abandoned; let it win and roll back.
            throw new CheckoutInProgressException("This checkout is already being processed. Please wait a moment.");
        }

        List<Long> purchased = List.copyOf(lines.keySet());
        afterCommit(() -> {
            productCacheService.evictProducts(purchased); // cached stock is now stale
            cartService.removePurchased(userId, purchased);
        });
        return OrderResponse.from(saved);
    }

    private RuntimeException explainFailedDecrement(Product product, int requested) {
        // Diagnostic read only; the conditional UPDATE above is what kept stock safe.
        List<Object[]> rows = productRepository.findStockSnapshot(product.getId());
        if (rows.isEmpty()) {
            return ResourceNotFoundException.product(product.getId());
        }
        Object[] row = rows.get(0);
        int stock = row[1] == null ? 0 : ((Number) row[1]).intValue();
        boolean active = Boolean.TRUE.equals(row[2]);
        if (!active) {
            return new ProductUnavailableException(product.getId(), product.getName());
        }
        return new InsufficientStockException(product.getId(), product.getName(), requested, stock);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    record Line(Long productId, int quantity, BigDecimal expectedUnitPrice, BigDecimal expectedCargoPrice) {
    }

    /** Merge duplicate product lines and sort by product ID. */
    Map<Long, Line> normalise(OrderRequest request) {
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new IllegalArgumentException("Your bag is empty. Add something before checking out.");
        }
        Map<Long, Line> merged = new TreeMap<>();
        for (OrderRequest.OrderItemRequest item : request.getItems()) {
            if (item.getProductId() == null || item.getQuantity() == null || item.getQuantity() < 1) {
                throw new IllegalArgumentException("Each item needs a product and a quantity of at least 1.");
            }
            merged.merge(item.getProductId(),
                    new Line(item.getProductId(), item.getQuantity(), item.getExpectedUnitPrice(), item.getExpectedCargoPrice()),
                    (a, b) -> new Line(a.productId(), a.quantity() + b.quantity(),
                            a.expectedUnitPrice() != null ? a.expectedUnitPrice() : b.expectedUnitPrice(),
                            a.expectedCargoPrice() != null ? a.expectedCargoPrice() : b.expectedCargoPrice()));
        }
        for (Line line : merged.values()) {
            if (line.quantity() > maxQuantityPerItem) {
                throw new IllegalArgumentException("You can buy at most " + maxQuantityPerItem + " of one product per order.");
            }
        }
        return merged;
    }

    private OrderResponse loadOwnOrder(Long orderId, Long userId) {
        return tx.execute(status -> orderRepository.findByIdAndUserId(orderId, userId)
                .map(OrderResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found")));
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        action.run();
                    } catch (RuntimeException e) {
                        log.warn("Post-commit checkout step failed: {}", e.getClass().getSimpleName());
                    }
                }
            });
        } else {
            action.run();
        }
    }
}
