package com.ecomerce.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "product_rating_summary")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductRatingSummary {

    @Id
    @Column(name = "product_id")
    private Long productId;

    @Column(name = "average_rating", nullable = false, precision = 3, scale = 2)
    @Builder.Default
    private BigDecimal averageRating = BigDecimal.ZERO;

    @Column(name = "total_reviews", nullable = false)
    @Builder.Default
    private Integer totalReviews = 0;

    @Column(name = "rating_1_count", nullable = false)
    @Builder.Default
    private Integer rating1Count = 0;

    @Column(name = "rating_2_count", nullable = false)
    @Builder.Default
    private Integer rating2Count = 0;

    @Column(name = "rating_3_count", nullable = false)
    @Builder.Default
    private Integer rating3Count = 0;

    @Column(name = "rating_4_count", nullable = false)
    @Builder.Default
    private Integer rating4Count = 0;

    @Column(name = "rating_5_count", nullable = false)
    @Builder.Default
    private Integer rating5Count = 0;

    @Column(name = "updated_at")
    @Builder.Default
    private OffsetDateTime updatedAt = OffsetDateTime.now();
}
