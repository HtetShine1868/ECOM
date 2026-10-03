package com.ecomerce.dto;

import com.ecomerce.entity.Product;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
public class ProductResponse {
    private Long id;
    private String name;
    private String description;
    private BigDecimal price;
    private Integer stock;
    private BigDecimal cargoPrice;
    private String imageUrl;
    private Long categoryId;
    private String categoryName;
    private String category; // alias for frontend compatibility
    private Long unitsSold;
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
                .cargoPrice(product.getCargoPrice())
                .imageUrl(product.getImageUrl())
                .categoryId(product.getCategory() != null ? product.getCategory().getId() : null)
                .categoryName(catName)
                .category(catName)
                .unitsSold(product.getUnitsSold() == null ? 0L : product.getUnitsSold())
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .build();
    }
}
