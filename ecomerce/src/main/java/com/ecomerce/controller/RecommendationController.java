package com.ecomerce.controller;

import com.ecomerce.dto.RecommendationItemResponse;
import com.ecomerce.dto.TrackEventRequest;
import com.ecomerce.entity.User;
import com.ecomerce.service.AuthService;
import com.ecomerce.service.RecommendationService;
import com.ecomerce.service.UserActivityService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/recommendations")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendationService;
    private final UserActivityService activityService;
    private final AuthService authService;

    @GetMapping("/for-you")
    public ResponseEntity<List<RecommendationItemResponse>> getForYou(
            @RequestParam(defaultValue = "10") int limit,
            @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = null;
        if (userDetails != null) {
            User user = authService.requireByEmail(userDetails.getUsername());
            userId = user.getId();
        }
        return ResponseEntity.ok(recommendationService.getPersonalizedRecommendations(userId, limit));
    }

    @GetMapping("/related/{productId}")
    public ResponseEntity<List<RecommendationItemResponse>> getRelated(
            @PathVariable("productId") Long productId,
            @RequestParam(defaultValue = "8") int limit) {
        return ResponseEntity.ok(recommendationService.getRelatedProducts(productId, limit));
    }

    @GetMapping("/popular")
    public ResponseEntity<List<RecommendationItemResponse>> getPopular(
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(recommendationService.getPopularProducts(limit));
    }

    @GetMapping("/frequently-bought/{productId}")
    public ResponseEntity<List<RecommendationItemResponse>> getFrequentlyBought(
            @PathVariable("productId") Long productId,
            @RequestParam(defaultValue = "6") int limit) {
        return ResponseEntity.ok(recommendationService.getFrequentlyBoughtTogether(productId, limit));
    }

    @GetMapping("/recently-viewed")
    public ResponseEntity<List<RecommendationItemResponse>> getRecentlyViewed(
            @RequestParam(required = false) String sessionId,
            @RequestParam(defaultValue = "8") int limit,
            @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = null;
        if (userDetails != null) {
            User user = authService.requireByEmail(userDetails.getUsername());
            userId = user.getId();
        }
        return ResponseEntity.ok(recommendationService.getRecentlyViewed(userId, sessionId, limit));
    }

    @PostMapping("/events")
    public ResponseEntity<Void> trackEvent(
            @Valid @RequestBody TrackEventRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = null;
        if (userDetails != null) {
            try {
                User user = authService.requireByEmail(userDetails.getUsername());
                userId = user.getId();
            } catch (Exception ignored) {
            }
        }
        activityService.recordEvent(userId, request.getProductId(), request.getEventType(), request.getSessionId());
        return ResponseEntity.accepted().build();
    }
}
