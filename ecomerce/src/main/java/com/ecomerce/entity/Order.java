package com.ecomerce.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String customerName;

    private String customerPhone;

    @Column(nullable = false)
    private String deliveryAddress;

    /** Town name snapshot from a predefined DeliveryZone (null if custom address) */
    private String townName;

    /** Delivery fee from the chosen zone (0 if custom address) */
    @Column(nullable = true, precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal deliveryFee = BigDecimal.ZERO;

    /** Sum of (unitPrice × quantity) for all items */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal subtotal;

    /** Sum of cargoPrice for all items */
    @Column(nullable = true, precision = 15, scale = 2)
    private BigDecimal cargoTotal;

    /** subtotal + cargoTotal + deliveryFee */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal total;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private OrderStatus status = OrderStatus.PENDING;

    /** Client-generated key so a double submit returns the same order. */
    @Column(unique = true)
    private String idempotencyKey;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime orderDate;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<OrderItem> orderItems = new ArrayList<>();

    public enum OrderStatus {
        PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERING, DELIVERED, CANCELLED
    }
}
