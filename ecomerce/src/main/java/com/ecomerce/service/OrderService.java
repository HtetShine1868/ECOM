package com.ecomerce.service;

import com.ecomerce.dto.OrderRequest;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.entity.*;
import com.ecomerce.exception.InsufficientStockException;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.exception.UnauthorizedException;
import com.ecomerce.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final CartRepository cartRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final DeliveryZoneService deliveryZoneService;

    @Transactional
    public OrderResponse placeOrder(Long userId, OrderRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Cart cart = cartRepository.findByUserId(userId)
                .orElseThrow(() -> new IllegalArgumentException("Cart is empty. Add items before placing an order."));

        if (cart.getCartItems().isEmpty()) {
            throw new IllegalArgumentException("Cart is empty. Add items before placing an order.");
        }

        // Validate that both delivery options are provided
        if (request.getDeliveryZoneId() == null) {
            throw new IllegalArgumentException("Please select a delivery zone (township).");
        }
        if (request.getCustomDeliveryAddress() == null || request.getCustomDeliveryAddress().isBlank()) {
            throw new IllegalArgumentException("Please provide a specific delivery address (street, block, etc.).");
        }

        // Resolve delivery zone
        DeliveryZone zone = deliveryZoneService.resolveZone(request.getDeliveryZoneId());
        String townName = zone.getTownName();
        String deliveryAddress = request.getCustomDeliveryAddress().trim();
        BigDecimal deliveryFee = zone.getFee() != null ? zone.getFee() : BigDecimal.ZERO;

        // Validate stock and build order items
        List<OrderItem> orderItems = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal cargoTotal = BigDecimal.ZERO;

        for (CartItem cartItem : cart.getCartItems()) {
            Product product = productRepository.findById(cartItem.getProduct().getId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Product not found: " + cartItem.getProduct().getId()));

            if (product.getStock() < cartItem.getQuantity()) {
                throw new InsufficientStockException(
                        product.getName(), cartItem.getQuantity(), product.getStock());
            }

            BigDecimal lineTotal = product.getPrice()
                    .multiply(BigDecimal.valueOf(cartItem.getQuantity()));
            subtotal = subtotal.add(lineTotal);
            BigDecimal itemCargoPrice = BigDecimal.ZERO;
            cargoTotal = cargoTotal.add(itemCargoPrice);

            OrderItem orderItem = OrderItem.builder()
                    .productName(product.getName())
                    .unitPrice(product.getPrice())
                    .cargoPrice(itemCargoPrice)
                    .productImageUrl(product.getImageUrl())
                    .quantity(cartItem.getQuantity())
                    .product(product)
                    .build();
            orderItems.add(orderItem);

            // Decrement stock
            product.setStock(product.getStock() - cartItem.getQuantity());
            productRepository.save(product);
        }

        BigDecimal total = subtotal.add(cargoTotal).add(deliveryFee);

        // Create order
        Order order = Order.builder()
                .user(user)
                .customerName(request.getCustomerName())
                .customerPhone(request.getCustomerPhone())
                .deliveryAddress(deliveryAddress)
                .townName(townName)
                .deliveryFee(deliveryFee)
                .subtotal(subtotal)
                .cargoTotal(cargoTotal)
                .total(total)
                .status(Order.OrderStatus.PENDING)
                .build();

        order = orderRepository.save(order);

        // Link order items
        for (OrderItem item : orderItems) {
            item.setOrder(order);
        }
        order.setOrderItems(orderItems);
        order = orderRepository.save(order);

        // Clear cart
        cart.getCartItems().clear();
        cartRepository.save(cart);

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
        return orderRepository.findAll().stream()
                .map(OrderResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrderResponse updateOrderStatus(Long orderId, Order.OrderStatus newStatus) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));
        order.setStatus(newStatus);
        return OrderResponse.from(orderRepository.save(order));
    }
}
