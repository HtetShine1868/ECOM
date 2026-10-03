package com.ecomerce.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
public class ChatResponse {

    private String reply;
    private String mode;

    @Builder.Default
    private List<ProductCard> products = new ArrayList<>();

    @Data
    @Builder
    public static class ProductCard {
        private Long id;
        private String name;
        private String description;
        private BigDecimal price;
        private Integer stock;
        private Boolean available;
        private String imageUrl;
        private String categoryName;
    }
}
