package com.ecomerce.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "order_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    /** Snapshot — preserved even if product is deleted/updated */
    @Column(nullable = false)
    private String productName;

    /** Purchase-time price snapshot */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPrice;

    /** Purchase-time cargo price snapshot */
    @Column(nullable = true, precision = 10, scale = 2)
    private BigDecimal cargoPrice;

    private String productImageUrl;

    @Column(nullable = false)
    private Integer quantity;
}
