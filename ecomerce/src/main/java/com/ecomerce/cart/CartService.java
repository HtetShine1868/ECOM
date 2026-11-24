package com.ecomerce.cart;

import com.ecomerce.common.infra.RedisAvailability;
import com.ecomerce.dto.CartResponse;
import com.ecomerce.entity.Product;
import com.ecomerce.exception.CartUnavailableException;
import com.ecomerce.exception.InsufficientStockException;
import com.ecomerce.exception.ProductUnavailableException;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * Shopping cart for the authenticated user.
 *
 * <ul>
 *   <li>Storage: Redis when enabled ({@link RedisCartStore}), otherwise PostgreSQL
 *       ({@link PostgresCartStore}). The choice is made by configuration, not per request,
 *       so a cart never silently splits between two stores. If Redis is enabled but down,
 *       cart calls return 503 CART_UNAVAILABLE; checkout is unaffected.</li>
 *   <li>Adding, updating or removing items never changes product stock and never reserves it.</li>
 *   <li>Every response is rebuilt from current PostgreSQL product data.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CartService {

    private final RedisCartStore redisStore;
    private final PostgresCartStore postgresStore;
    private final RedisAvailability redisAvailability;
    private final ProductRepository productRepository;
    private final com.ecomerce.service.UserActivityService activityService;

    @Value("${app.cart.max-quantity-per-item:99}")
    private int maxQuantityPerItem;

    @Value("${app.cart.max-distinct-items:50}")
    private int maxDistinctItems;

    public CartResponse getCart(Long userId) {
        CartStore store = store();
        return assemble(store, guarded(() -> store.lines(userId)));
    }

    public CartResponse addItem(Long userId, Long productId, int quantity) {
        CartValidation.requireQuantity(quantity, maxQuantityPerItem);
        Product product = requirePurchasable(productId);
        CartStore store = store();

        int current = guarded(() -> store.quantityOf(userId, productId));
        int stock = product.getStock() == null ? 0 : product.getStock();
        if (current + quantity > stock) {
            throw new InsufficientStockException(product.getId(), product.getName(), current + quantity, stock);
        }
        int result = guarded(() -> store.add(userId, productId, quantity,
                maxQuantityPerItem, maxDistinctItems, product.getPrice()));
        if (result < 0) {
            throw new IllegalArgumentException("Your bag can hold up to " + maxDistinctItems + " different products.");
        }
        activityService.recordCartAdd(userId, productId);
        return getCart(userId);
    }

    public CartResponse updateItem(Long userId, Long productId, int quantity) {
        if (quantity <= 0) {
            return removeItem(userId, productId);
        }
        CartValidation.requireQuantity(quantity, maxQuantityPerItem);
        Product product = requirePurchasable(productId);
        int stock = product.getStock() == null ? 0 : product.getStock();
        if (quantity > stock) {
            throw new InsufficientStockException(product.getId(), product.getName(), quantity, stock);
        }
        CartStore store = store();
        guarded(() -> {
            store.setQuantity(userId, productId, quantity, product.getPrice());
            return null;
        });
        return getCart(userId);
    }

    public CartResponse removeItem(Long userId, Long productId) {
        CartStore store = store();
        guarded(() -> {
            store.remove(userId, productId);
            return null;
        });
        return getCart(userId);
    }

    public void clearCart(Long userId) {
        CartStore store = store();
        guarded(() -> {
            store.clear(userId);
            return null;
        });
    }

    /** Customer confirmed the current prices shown in the cart. */
    public CartResponse acknowledgePrices(Long userId) {
        CartStore store = store();
        List<CartStore.Line> lines = guarded(() -> store.lines(userId));
        Map<Long, BigDecimal> current = productRepository
                .findAllById(lines.stream().map(CartStore.Line::productId).toList()).stream()
                .collect(Collectors.toMap(Product::getId, Product::getPrice));
        guarded(() -> {
            store.acknowledgePrices(userId, current);
            return null;
        });
        return getCart(userId);
    }

    /** Best effort, after a successful checkout. Never fails the order. */
    public void removePurchased(Long userId, Collection<Long> productIds) {
        try {
            CartStore store = store();
            guarded(() -> {
                store.removeAll(userId, productIds);
                return null;
            });
        } catch (RuntimeException e) {
            log.warn("Order placed, but purchased items could not be removed from the cart of user {}", userId);
        }
    }

    public String storageName() {
        return redisAvailability.isEnabled() ? redisStore.name() : postgresStore.name();
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    private CartStore store() {
        if (!redisAvailability.isEnabled()) {
            return postgresStore;
        }
        if (!redisAvailability.isUsable()) {
            throw new CartUnavailableException("Your bag is temporarily unavailable. Please try again shortly.", null);
        }
        return redisStore;
    }

    /** Converts Redis failures into a clear 503 and opens the Redis circuit. */
    private <T> T guarded(Supplier<T> action) {
        try {
            return action.get();
        } catch (org.springframework.dao.DataAccessException e) {
            if (redisAvailability.isEnabled()) {
                // Spring Data Redis translates every Lettuce error into a DataAccessException.
                redisAvailability.recordFailure("cart", e);
                throw new CartUnavailableException("Your bag is temporarily unavailable. Please try again shortly.", e);
            }
            throw e;
        }
    }

    private Product requirePurchasable(Long productId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> ResourceNotFoundException.product(productId));
        if (!Boolean.TRUE.equals(product.getActive())) {
            throw new ProductUnavailableException(product.getId(), product.getName());
        }
        return product;
    }

    private CartResponse assemble(CartStore store, List<CartStore.Line> lines) {
        Map<Long, Product> products = productRepository
                .findAllById(lines.stream().map(CartStore.Line::productId).toList()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        return CartAssembler.assemble(store.name(), lines, products);
    }
}
