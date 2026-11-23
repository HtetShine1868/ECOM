package com.ecomerce.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatResponse {

    private String reply;
    private String mode;

    @Builder.Default
    private List<ProductCard> products = new ArrayList<>();

    /** Short follow-up questions the shopper can tap. */
    @Builder.Default
    private List<String> suggestions = new ArrayList<>();

    /** Buttons that take the shopper somewhere (a page, or "#bag" to open the bag). */
    @Builder.Default
    private List<Action> actions = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
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

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Action {
        private String label;
        private String href;
    }
}
