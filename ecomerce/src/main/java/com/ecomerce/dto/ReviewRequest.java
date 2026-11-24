package com.ecomerce.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class ReviewRequest {

    @NotNull(message = "Rating is required")
    @Min(value = 1, message = "Rating must be at least 1")
    @Max(value = 5, message = "Rating cannot exceed 5")
    private Short rating;

    @jakarta.validation.constraints.Size(max = 120, message = "Title must be 120 characters or less")
    private String title;

    @jakarta.validation.constraints.Size(max = 2000, message = "Review must be 2000 characters or less")
    private String comment;

    /** URLs returned by POST /api/reviews/images. Anything else is rejected. */
    @jakarta.validation.constraints.Size(max = 6, message = "You can attach up to 6 photos")
    private List<String> imageUrls;
}
