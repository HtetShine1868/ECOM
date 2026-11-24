package com.ecomerce.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class RecommendationItemResponse {
    private ProductResponse product;
    private String recommendationType; // e.g. "FOR_YOU", "RELATED", "POPULAR", "FREQUENTLY_BOUGHT", "RECENTLY_VIEWED"
    private String reason;             // e.g. "Because you viewed similar items", "Frequently bought together"
    private Double score;
}
