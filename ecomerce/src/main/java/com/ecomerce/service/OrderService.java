package com.ecomerce.service;

import com.ecomerce.dto.OrderRequest;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.entity.*;
import com.ecomerce.exception.InsufficientStockException;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final DeliveryZoneService deliveryZoneService;
    private final NotificationService notificationService;

    @Transactional
    public OrderResponse placeOrder(Long userId, OrderRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (request.getIdempotencyKey() != null && !request.getIdempotencyKey().isBlank()) {
            var existing = orderRepository.findByIdempotencyKey(request.getIdempotencyKey().trim());
            if (existing.isPresent()) {
                if (!existing.get().getUser().getId().equals(userId)) {
                    throw new IllegalArgumentException("Something went wrong. Please try again.");
                }
                return OrderResponse.from(existing.get());
            }
        }

        // Validate that items were provided
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new IllegalArgumentException("Your cart is empty. Please add items to your cart before placing an order.");
        }

        // Validate that both delivery options are provided
        if (request.getDeliveryZoneId() == null) {
            throw new IllegalArgumentException("Please select a delivery zone (township).");
        }
        if (request.getCustomDeliveryAddress() == null || request.getCustomDeliveryAddress().isBlank()) {
            throw new IllegalArgumentException("Please provide a specific delivery address (street, block, etc.).");
        }
        String phone = request.getCustomerPhone() == null ? "" : request.getCustomerPhone().trim();
        if (!phone.matches("\\+95[1-9]\\d{6,10}")) {
            throw new IllegalArgumentException(
                    "Phone must be a Myanmar number like +959123456789 (digits only after +95).");
        }

        // Resolve delivery zone
        DeliveryZone zone = deliveryZoneService.resolveZone(request.getDeliveryZoneId());
        String townName = zone.getTownName();
        String deliveryAddress = request.getCustomDeliveryAddress().trim();
        BigDecimal deliveryFee = zone.getFee() != null ? zone.getFee() : BigDecimal.ZERO;

        // Validate stock and build order items from request payload
        List<OrderItem> orderItems = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal cargoTotal = BigDecimal.ZERO;

        for (OrderRequest.OrderItemRequest itemReq : request.getItems()) {
            Product product = productRepository.findById(itemReq.getProductId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Product not found: " + itemReq.getProductId()));

            int currentStock = product.getStock() != null ? product.getStock() : 0;
            if (currentStock < itemReq.getQuantity()) {
                throw new InsufficientStockException(
                        product.getName(), itemReq.getQuantity(), currentStock);
            }

            BigDecimal lineTotal = product.getPrice()
                    .multiply(BigDecimal.valueOf(itemReq.getQuantity()));
            subtotal = subtotal.add(lineTotal);
            BigDecimal itemCargoPrice = product.getCargoPrice() != null
                    ? product.getCargoPrice()
                    : BigDecimal.ZERO;
            cargoTotal = cargoTotal.add(itemCargoPrice.multiply(BigDecimal.valueOf(itemReq.getQuantity())));

            OrderItem orderItem = OrderItem.builder()
                    .productName(product.getName())
                    .unitPrice(product.getPrice())
                    .cargoPrice(itemCargoPrice)
                    .productImageUrl(product.getImageUrl())
                    .quantity(itemReq.getQuantity())
                    .product(product)
                    .build();
            orderItems.add(orderItem);

            // Decrement stock
            product.setStock(currentStock - itemReq.getQuantity());
            productRepository.save(product);
        }

        BigDecimal total = subtotal.add(cargoTotal).add(deliveryFee);

        // Create order
        Order order = Order.builder()
                .user(user)
                .customerName(request.getCustomerName().trim())
                .customerPhone(phone)
                .deliveryAddress(deliveryAddress)
                .townName(townName)
                .deliveryFee(deliveryFee)
                .subtotal(subtotal)
                .cargoTotal(cargoTotal)
                .total(total)
                .status(Order.OrderStatus.PENDING)
                .idempotencyKey(request.getIdempotencyKey() == null || request.getIdempotencyKey().isBlank()
                        ? null
                        : request.getIdempotencyKey().trim())
                .build();

        order = orderRepository.save(order);

        // Link order items
        for (OrderItem item : orderItems) {
            item.setOrder(order);
        }
        order.setOrderItems(orderItems);
        order = orderRepository.save(order);

        Long savedOrderId = order.getId();
        String savedCustomerName = order.getCustomerName();
        BigDecimal savedTotal = order.getTotal();
        afterCommit(() -> {
            try {
                notificationService.notifyNewOrder(savedOrderId, savedCustomerName, savedTotal);
            } catch (Exception ex) {
                log.warn("Order {} was saved, but admins were not notified", savedOrderId, ex);
            }
        });

        return OrderResponse.from(order);
    }

    public List<OrderResponse> getMyOrders(Long userId) {
        return orderRepository.findByUserIdOrderByOrderDateDesc(userId).stream()
                .map(OrderResponse::from)
                .collect(Collectors.toList());
    }

    public OrderResponse getOrderById(Long orderId, Long userId, boolean isAdmin) {
        if (isAdmin) {
            Order order = orderRepository.findById(orderId)
                    .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));
            return OrderResponse.from(order);
        }

        Order order = orderRepository.findByIdAndUserId(orderId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found or access denied"));
        return OrderResponse.from(order);
    }

    public List<OrderResponse> getAllOrders() {
        return orderRepository.findAllWithUser().stream()
                .map(OrderResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrderResponse updateOrderStatus(Long orderId, Order.OrderStatus newStatus) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));
        Order.OrderStatus previous = order.getStatus();
        order.setStatus(newStatus);
        order = orderRepository.save(order);
        if (previous != newStatus && order.getUser() != null) {
            Long userId = order.getUser().getId();
            Long savedOrderId = order.getId();
            String statusName = newStatus.name();
            afterCommit(() -> {
                try {
                    notificationService.notifyStatusChange(userId, savedOrderId, statusName);
                } catch (Exception ex) {
                    log.warn("Order {} status saved, but the customer was not notified", savedOrderId, ex);
                }
            });
        }
        return OrderResponse.from(order);
    }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }
}
