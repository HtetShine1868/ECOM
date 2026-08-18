package com.ecomerce.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
public class BestSellerResponse {
    private Long productId;
    private String name;
    private String description;
    private BigDecimal price;
    private Integer stock;
    private BigDecimal cargoPrice;
    private String imageUrl;
    private Long categoryId;
    private String categoryName;
    private Long totalSold;
    private LocalDateTime createdAt;
}
