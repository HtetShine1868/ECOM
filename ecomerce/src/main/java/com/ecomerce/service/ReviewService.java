package com.ecomerce.service;

import com.ecomerce.dto.RatingSummaryResponse;
import com.ecomerce.dto.ReviewRequest;
import com.ecomerce.dto.ReviewResponse;
import com.ecomerce.entity.OrderItem;
import com.ecomerce.entity.Product;
import com.ecomerce.entity.ProductRatingSummary;
import com.ecomerce.entity.Review;
import com.ecomerce.entity.ReviewImage;
import com.ecomerce.entity.User;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.exception.UnauthorizedException;
import com.ecomerce.repository.OrderItemRepository;
import com.ecomerce.repository.ProductRatingSummaryRepository;
import com.ecomerce.repository.ProductRepository;
import com.ecomerce.repository.ReviewImageRepository;
import com.ecomerce.repository.ReviewRepository;
import com.ecomerce.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final ReviewImageRepository reviewImageRepository;
    private final ProductRatingSummaryRepository ratingSummaryRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final OrderItemRepository orderItemRepository;
    private final AccountVerificationService accountVerificationService;
    private final Optional<StringRedisTemplate> redisTemplate;

    private static final String RATING_CACHE_PREFIX = "product:rating:";
    private static final Duration RATING_CACHE_TTL = Duration.ofMinutes(10);

    @Transactional(readOnly = true)
    public boolean checkEligibility(Long userId, Long productId) {
        if (userId == null || productId == null) return false;
        try {
            accountVerificationService.requireVerifiedEmail(userId);
        } catch (Exception e) {
            return false;
        }
        if (reviewRepository.existsByUserIdAndProductId(userId, productId)) {
            return false;
        }
        return orderItemRepository.hasPurchasedProduct(userId, productId);
    }

    @Transactional
    public ReviewResponse createReview(Long userId, Long productId, ReviewRequest request) {
        accountVerificationService.requireVerifiedEmail(userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + productId));

        if (reviewRepository.existsByUserIdAndProductId(userId, productId)) {
            throw new IllegalArgumentException("You have already reviewed this product.");
        }

        List<OrderItem> purchasedItems = orderItemRepository.findDeliveredItemsForUserAndProduct(userId, productId);
        if (purchasedItems.isEmpty()) {
            throw new UnauthorizedException("You can only review products you have purchased and received.");
        }

        OrderItem orderItem = purchasedItems.get(0);

        Review review = Review.builder()
                .user(user)
                .product(product)
                .orderItem(orderItem)
                .rating(request.getRating())
                .title(request.getTitle())
                .comment(request.getComment())
                .build();

        review = reviewRepository.save(review);

        if (request.getImageUrls() != null && !request.getImageUrls().isEmpty()) {
            List<ReviewImage> images = new ArrayList<>();
            for (String url : request.getImageUrls()) {
                if (url != null && !url.isBlank()) {
                    images.add(ReviewImage.builder()
                            .review(review)
                            .imageUrl(url.trim())
                            .build());
                }
            }
            if (!images.isEmpty()) {
                images = reviewImageRepository.saveAll(images);
                review.setImages(images);
            }
        }

        recalculateAndSaveSummary(productId);
        evictRatingCache(productId);

        return ReviewResponse.from(review, true);
    }

    @Transactional
    public ReviewResponse updateReview(Long userId, Long reviewId, ReviewRequest request) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found: " + reviewId));

        if (!review.getUser().getId().equals(userId)) {
            throw new UnauthorizedException("You can only edit your own reviews.");
        }

        review.setRating(request.getRating());
        review.setTitle(request.getTitle());
        review.setComment(request.getComment());

        if (request.getImageUrls() != null) {
            // Replace images
            review.getImages().clear();
            reviewImageRepository.deleteAll(reviewImageRepository.findByReviewId(reviewId));
            List<ReviewImage> newImages = new ArrayList<>();
            for (String url : request.getImageUrls()) {
                if (url != null && !url.isBlank()) {
                    newImages.add(ReviewImage.builder()
                            .review(review)
                            .imageUrl(url.trim())
                            .build());
                }
            }
            if (!newImages.isEmpty()) {
                newImages = reviewImageRepository.saveAll(newImages);
                review.setImages(newImages);
            }
        }

        review = reviewRepository.save(review);
        Long productId = review.getProduct().getId();
        recalculateAndSaveSummary(productId);
        evictRatingCache(productId);

        boolean verified = orderItemRepository.hasPurchasedProduct(userId, productId);
        return ReviewResponse.from(review, verified);
    }

    @Transactional
    public void deleteReview(Long userId, Long reviewId) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found: " + reviewId));

        if (!review.getUser().getId().equals(userId)) {
            throw new UnauthorizedException("You can only delete your own reviews.");
        }

        Long productId = review.getProduct().getId();
        reviewRepository.delete(review);
        recalculateAndSaveSummary(productId);
        evictRatingCache(productId);
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> getProductReviews(Long productId, int page, int size, String sortBy) {
        Sort sort = switch (sortBy != null ? sortBy.toLowerCase() : "newest") {
            case "oldest" -> Sort.by(Sort.Direction.ASC, "createdAt");
            case "highest" -> Sort.by(Sort.Direction.DESC, "rating").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            case "lowest" -> Sort.by(Sort.Direction.ASC, "rating").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };

        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(size > 0 ? size : 10, 50), sort);
        return reviewRepository.findByProductId(productId, pageable)
                .map(r -> ReviewResponse.from(r, r.getOrderItem() != null || orderItemRepository.hasPurchasedProduct(r.getUser().getId(), productId)));
    }

    @Transactional(readOnly = true)
    public RatingSummaryResponse getRatingSummary(Long productId) {
        return ratingSummaryRepository.findById(productId)
                .map(RatingSummaryResponse::from)
                .orElseGet(() -> RatingSummaryResponse.builder()
                        .productId(productId)
                        .averageRating(BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP))
                        .totalReviews(0)
                        .rating1Count(0)
                        .rating2Count(0)
                        .rating3Count(0)
                        .rating4Count(0)
                        .rating5Count(0)
                        .updatedAt(OffsetDateTime.now())
                        .build());
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> getUserReviews(Long userId, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(size > 0 ? size : 10, 50), Sort.by(Sort.Direction.DESC, "createdAt"));
        return reviewRepository.findByUserId(userId, pageable)
                .map(r -> ReviewResponse.from(r, true));
    }

    private void recalculateAndSaveSummary(Long productId) {
        List<Object[]> starCounts = reviewRepository.countRatingsByStar(productId);
        int r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0;
        int total = 0;
        int sum = 0;

        for (Object[] row : starCounts) {
            short rating = ((Number) row[0]).shortValue();
            long count = ((Number) row[1]).longValue();
            total += (int) count;
            sum += rating * (int) count;
            switch (rating) {
                case 1 -> r1 = (int) count;
                case 2 -> r2 = (int) count;
                case 3 -> r3 = (int) count;
                case 4 -> r4 = (int) count;
                case 5 -> r5 = (int) count;
            }
        }

        BigDecimal avg = total > 0
                ? BigDecimal.valueOf((double) sum / total).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

        ProductRatingSummary summary = ratingSummaryRepository.findById(productId)
                .orElseGet(() -> {
                    Product p = productRepository.getReferenceById(productId);
                    return ProductRatingSummary.builder().product(p).productId(productId).build();
                });

        summary.setAverageRating(avg);
        summary.setTotalReviews(total);
        summary.setRating1Count(r1);
        summary.setRating2Count(r2);
        summary.setRating3Count(r3);
        summary.setRating4Count(r4);
        summary.setRating5Count(r5);
        summary.setUpdatedAt(OffsetDateTime.now());

        ratingSummaryRepository.save(summary);
    }

    private void evictRatingCache(Long productId) {
        redisTemplate.ifPresent(rt -> {
            try {
                rt.delete(RATING_CACHE_PREFIX + productId);
            } catch (Exception e) {
                log.warn("Failed to evict Redis rating cache for product {}: {}", productId, e.getMessage());
            }
        });
    }
}
