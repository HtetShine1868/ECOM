package com.ecomerce.dto;

import com.ecomerce.entity.ProductRatingSummary;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;

@Data
@Builder
public class RatingSummaryResponse {
    private Long productId;
    private BigDecimal averageRating;
    private Integer totalReviews;
    private Integer rating1Count;
    private Integer rating2Count;
    private Integer rating3Count;
    private Integer rating4Count;
    private Integer rating5Count;
    private OffsetDateTime updatedAt;

    public static RatingSummaryResponse from(ProductRatingSummary summary) {
        if (summary == null) {
            return RatingSummaryResponse.builder()
                    .averageRating(BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP))
                    .totalReviews(0)
                    .rating1Count(0)
                    .rating2Count(0)
                    .rating3Count(0)
                    .rating4Count(0)
                    .rating5Count(0)
                    .updatedAt(OffsetDateTime.now())
                    .build();
        }
        return RatingSummaryResponse.builder()
                .productId(summary.getProductId())
                .averageRating(summary.getAverageRating() != null ?
                        summary.getAverageRating().setScale(1, RoundingMode.HALF_UP) : BigDecimal.ZERO)
                .totalReviews(summary.getTotalReviews() != null ? summary.getTotalReviews() : 0)
                .rating1Count(summary.getRating1Count() != null ? summary.getRating1Count() : 0)
                .rating2Count(summary.getRating2Count() != null ? summary.getRating2Count() : 0)
                .rating3Count(summary.getRating3Count() != null ? summary.getRating3Count() : 0)
                .rating4Count(summary.getRating4Count() != null ? summary.getRating4Count() : 0)
                .rating5Count(summary.getRating5Count() != null ? summary.getRating5Count() : 0)
                .updatedAt(summary.getUpdatedAt())
                .build();
    }
}
