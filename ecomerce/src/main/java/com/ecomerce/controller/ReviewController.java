package com.ecomerce.controller;

import com.ecomerce.dto.RatingSummaryResponse;
import com.ecomerce.dto.ReviewRequest;
import com.ecomerce.dto.ReviewResponse;
import com.ecomerce.entity.User;
import com.ecomerce.service.AuthService;
import com.ecomerce.service.ReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;
    private final AuthService authService;

    @PostMapping("/products/{id}/reviews")
    public ResponseEntity<ReviewResponse> createReview(
            @PathVariable("id") Long productId,
            @Valid @RequestBody ReviewRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        User user = authService.requireByEmail(userDetails.getUsername());
        ReviewResponse response = reviewService.createReview(user.getId(), productId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/products/{id}/reviews")
    public ResponseEntity<Page<ReviewResponse>> getProductReviews(
            @PathVariable("id") Long productId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "newest") String sortBy) {
        return ResponseEntity.ok(reviewService.getProductReviews(productId, page, size, sortBy));
    }

    @GetMapping("/products/{id}/rating-summary")
    public ResponseEntity<RatingSummaryResponse> getRatingSummary(@PathVariable("id") Long productId) {
        return ResponseEntity.ok(reviewService.getRatingSummary(productId));
    }

    @GetMapping("/products/{id}/review-eligibility")
    public ResponseEntity<Map<String, Boolean>> checkEligibility(
            @PathVariable("id") Long productId,
            @AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.ok(Map.of("eligible", false));
        }
        User user = authService.requireByEmail(userDetails.getUsername());
        boolean eligible = reviewService.checkEligibility(user.getId(), productId);
        return ResponseEntity.ok(Map.of("eligible", eligible));
    }

    @PutMapping("/reviews/{id}")
    public ResponseEntity<ReviewResponse> updateReview(
            @PathVariable("id") Long reviewId,
            @Valid @RequestBody ReviewRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        User user = authService.requireByEmail(userDetails.getUsername());
        ReviewResponse response = reviewService.updateReview(user.getId(), reviewId, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/reviews/{id}")
    public ResponseEntity<Void> deleteReview(
            @PathVariable("id") Long reviewId,
            @AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        User user = authService.requireByEmail(userDetails.getUsername());
        reviewService.deleteReview(user.getId(), reviewId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/users/me/reviews")
    public ResponseEntity<Page<ReviewResponse>> getMyReviews(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        User user = authService.requireByEmail(userDetails.getUsername());
        return ResponseEntity.ok(reviewService.getUserReviews(user.getId(), page, size));
    }
}
