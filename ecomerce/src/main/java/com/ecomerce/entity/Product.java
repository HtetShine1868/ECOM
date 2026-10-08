package com.ecomerce.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Formula;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal price;

    @Column(nullable = false)
    @Builder.Default
    private Integer stock = 0;

    /** 1 when the product can be bought, 0 when it is sold out. Used only for ordering. */
    @Formula("(CASE WHEN COALESCE(stock, 0) > 0 THEN 1 ELSE 0 END)")
    private Integer inStockRank;

    @Column(nullable = true, precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal cargoPrice = BigDecimal.ZERO;

    private String imageUrl;

    /** Optional category — nullable so existing products are unaffected */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    /**
     * Purchase-based popularity. Units sold weigh more than order count,
     * and sales from the last 30 days add a recency boost. Cancelled orders
     * are excluded. Computed in the database so the frontend cannot invent it.
     */
    @Formula("(select coalesce(sum(oi.quantity),0) * 3 + count(distinct oi.order_id) * 2 + coalesce(sum(case when o.order_date >= (now() - interval '30 days') then oi.quantity else 0 end),0) from order_items oi join orders o on o.id = oi.order_id where oi.product_id = id and o.status <> 'CANCELLED')")
    private Long popularityScore;

    @Formula("(select coalesce(sum(oi.quantity),0) from order_items oi join orders o on o.id = oi.order_id where oi.product_id = id and o.status <> 'CANCELLED')")
    private Long unitsSold;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
