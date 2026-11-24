package com.ecomerce.dto;

import com.ecomerce.entity.Review;
import com.ecomerce.entity.ReviewImage;
import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class ReviewResponse {
    private Long id;
    private Long userId;
    private String userName;
    private Long productId;
    private Short rating;
    private String title;
    private String comment;
    private boolean verifiedPurchase;
    private List<String> imageUrls;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    public static ReviewResponse from(Review review, boolean verifiedPurchase) {
        return ReviewResponse.builder()
                .id(review.getId())
                .userId(review.getUser().getId())
                .userName(anonymizeUserName(review.getUser().getName()))
                .productId(review.getProduct().getId())
                .rating(review.getRating())
                .title(review.getTitle())
                .comment(review.getComment())
                .verifiedPurchase(verifiedPurchase)
                .imageUrls(review.getImages() != null ?
                        review.getImages().stream().map(ReviewImage::getImageUrl).toList() : List.of())
                .createdAt(review.getCreatedAt())
                .updatedAt(review.getUpdatedAt())
                .build();
    }

    private static String anonymizeUserName(String fullName) {
        if (fullName == null || fullName.isBlank()) return "Customer";
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) {
            String p = parts[0];
            return p.length() > 2 ? p.charAt(0) + "***" + p.charAt(p.length() - 1) : p;
        }
        return parts[0] + " " + parts[parts.length - 1].charAt(0) + ".";
    }
}
