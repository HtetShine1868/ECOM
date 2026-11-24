package com.ecomerce.dto;

import com.ecomerce.entity.Product;
import com.ecomerce.service.ImageUrls;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@lombok.NoArgsConstructor
@lombok.AllArgsConstructor
public class ProductResponse {
    private Long id;
    private String name;
    private String description;
    private BigDecimal price;
    private Integer stock;
    private Boolean active;
    /** Optimistic locking version — admin edits must submit this back */
    private Long version;
    private BigDecimal cargoPrice;
    private String imageUrl;
    private Long categoryId;
    private String categoryName;
    private String category; // alias for frontend compatibility
    private Long unitsSold;
    /** Average review rating (0 when unrated). Filled in by RatingEnricher, not by from(). */
    private Double averageRating;
    private Integer totalReviews;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static ProductResponse from(Product product) {
        String catName = product.getCategory() != null ? product.getCategory().getName() : null;
        return ProductResponse.builder()
                .id(product.getId())
                .name(product.getName())
                .description(product.getDescription())
                .price(product.getPrice())
                .stock(product.getStock())
                .active(product.getActive())
                .version(product.getVersion())
                .cargoPrice(product.getCargoPrice())
                .imageUrl(ImageUrls.reachable(product.getImageUrl()))
                .categoryId(product.getCategory() != null ? product.getCategory().getId() : null)
                .categoryName(catName)
                .category(catName)
                .unitsSold(product.getUnitsSold() == null ? 0L : product.getUnitsSold())
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .build();
    }
}

