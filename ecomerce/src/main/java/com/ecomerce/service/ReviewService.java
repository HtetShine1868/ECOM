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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Product reviews.
 *
 * Rules (all enforced here, from database records, never from the client):
 * <ul>
 *   <li>The reviewer is signed in, has a verified email, and is not suspended.</li>
 *   <li>They bought the product and that order is DELIVERED.</li>
 *   <li>One review per customer per product, and one review per order item.</li>
 *   <li>Reviews are public immediately; there is no moderation step.</li>
 *   <li>Only the author edits or deletes a review.</li>
 * </ul>
 * The rating summary is recomputed from the reviews table under a per-product advisory lock, so
 * two reviews landing at the same moment can never overwrite each other's contribution.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ReviewService {

    private static final long LOCK_NAMESPACE = 7_001_000_000_000L;

    private final ReviewRepository reviewRepository;
    private final ReviewImageRepository reviewImageRepository;
    private final ProductRatingSummaryRepository ratingSummaryRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final OrderItemRepository orderItemRepository;
    private final AccountVerificationService accountVerificationService;
    private final ProductCacheService cache;
    private final StorageService storageService;

    @Transactional(readOnly = true)
    public boolean checkEligibility(Long userId, Long productId) {
        if (userId == null || productId == null) return false;
        if (!accountVerificationService.isVerifiedAndActive(userId)) {
            return false;
        }
        if (reviewRepository.existsByUserIdAndProductId(userId, productId)) {
            return false;
        }
        return orderItemRepository.hasPurchasedProduct(userId, productId);
    }

    /** Why the shopper cannot review right now, for the UI: NOT_VERIFIED, ALREADY_REVIEWED, NOT_DELIVERED. */
    @Transactional(readOnly = true)
    public String ineligibleReason(Long userId, Long productId) {
        if (!accountVerificationService.isVerifiedAndActive(userId)) return "NOT_VERIFIED";
        if (reviewRepository.existsByUserIdAndProductId(userId, productId)) return "ALREADY_REVIEWED";
        return "NOT_DELIVERED";
    }

    @Transactional
    public ReviewResponse createReview(Long userId, Long productId, ReviewRequest request) {
        accountVerificationService.requireVerifiedEmail(userId);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> ResourceNotFoundException.product(productId));

        List<String> imageUrls = validatedImages(request.getImageUrls());

        reviewRepository.lockProductForRatingUpdate(LOCK_NAMESPACE + productId);

        if (reviewRepository.existsByUserIdAndProductId(userId, productId)) {
            throw new IllegalArgumentException("You have already reviewed this product. You can edit your review instead.");
        }
        List<OrderItem> purchased = orderItemRepository.findDeliveredItemsForUserAndProduct(userId, productId);
        if (purchased.isEmpty()) {
            throw new UnauthorizedException("You can review a product after an order containing it has been delivered.");
        }

        Review review = Review.builder()
                .user(user)
                .product(product)
                .orderItem(purchased.get(0))
                .rating(request.getRating())
                .title(clean(request.getTitle()))
                .comment(clean(request.getComment()))
                .build();
        try {
            review = reviewRepository.saveAndFlush(review);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException("You have already reviewed this product. You can edit your review instead.");
        }

        replaceImages(review, imageUrls);
        recalculateAndSaveSummary(productId);
        afterCommit(() -> ratingChanged(productId, userId));
        return ReviewResponse.from(review, true);
    }

    @Transactional
    public ReviewResponse updateReview(Long userId, Long reviewId, ReviewRequest request) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found: " + reviewId));
        if (!review.getUser().getId().equals(userId)) {
            throw new UnauthorizedException("You can only edit your own reviews.");
        }
        accountVerificationService.requireVerifiedEmail(userId); // a suspended author cannot keep editing

        Long productId = review.getProduct().getId();
        List<String> imageUrls = request.getImageUrls() == null ? null : validatedImages(request.getImageUrls());

        reviewRepository.lockProductForRatingUpdate(LOCK_NAMESPACE + productId);

        review.setRating(request.getRating());
        review.setTitle(clean(request.getTitle()));
        review.setComment(clean(request.getComment()));
        review.setUpdatedAt(OffsetDateTime.now());
        List<String> removed = new ArrayList<>();
        if (imageUrls != null) {
            review.getImages().forEach(i -> removed.add(i.getImageUrl()));
            removed.removeAll(imageUrls);
            replaceImages(review, imageUrls);
        }
        review = reviewRepository.save(review);

        recalculateAndSaveSummary(productId);
        afterCommit(() -> {
            ratingChanged(productId, userId);
            removed.forEach(storageService::deleteProductImage);
        });
        return ReviewResponse.from(review, true);
    }

    @Transactional
    public void deleteReview(Long userId, Long reviewId) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResourceNotFoundException("Review not found: " + reviewId));
        if (!review.getUser().getId().equals(userId)) {
            throw new UnauthorizedException("You can only delete your own reviews.");
        }
        Long productId = review.getProduct().getId();
        List<String> images = review.getImages().stream().map(ReviewImage::getImageUrl).toList();

        reviewRepository.lockProductForRatingUpdate(LOCK_NAMESPACE + productId);
        reviewRepository.delete(review);
        reviewRepository.flush();
        recalculateAndSaveSummary(productId);
        afterCommit(() -> {
            ratingChanged(productId, userId);
            images.forEach(storageService::deleteProductImage);
        });
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> getProductReviews(Long productId, int page, int size, String sortBy) {
        Sort sort = switch (sortBy != null ? sortBy.toLowerCase() : "newest") {
            case "oldest" -> Sort.by(Sort.Direction.ASC, "createdAt").and(Sort.by("id"));
            case "highest" -> Sort.by(Sort.Direction.DESC, "rating").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            case "lowest" -> Sort.by(Sort.Direction.ASC, "rating").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            default -> Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id"));
        };
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(size > 0 ? size : 10, 50), sort);
        // Every review is tied to a delivered purchase when it is created, so the badge is a record check.
        return reviewRepository.findByProductId(productId, pageable)
                .map(r -> ReviewResponse.from(r, r.getOrderItem() != null));
    }

    @Transactional(readOnly = true)
    public RatingSummaryResponse getRatingSummary(Long productId) {
        Optional<RatingSummaryResponse> cached = cache.getRating(productId);
        if (cached.isPresent()) {
            return cached.get();
        }
        RatingSummaryResponse summary = ratingSummaryRepository.findById(productId)
                .map(RatingSummaryResponse::from)
                .orElseGet(() -> RatingSummaryResponse.builder()
                        .productId(productId)
                        .averageRating(BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP))
                        .totalReviews(0)
                        .rating1Count(0).rating2Count(0).rating3Count(0).rating4Count(0).rating5Count(0)
                        .updatedAt(OffsetDateTime.now())
                        .build());
        cache.putRating(summary);
        return summary;
    }

    @Transactional(readOnly = true)
    public Page<ReviewResponse> getUserReviews(Long userId, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(size > 0 ? size : 10, 50),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        return reviewRepository.findByUserId(userId, pageable).map(r -> ReviewResponse.from(r, r.getOrderItem() != null));
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    private List<String> validatedImages(List<String> urls) {
        List<String> clean = new ArrayList<>();
        if (urls == null) return clean;
        for (String url : urls) {
            if (url == null || url.isBlank()) continue;
            if (!storageService.isReviewImageUrl(url.trim())) {
                throw new IllegalArgumentException("Review photos must be uploaded through the shop. Remove the invalid photo and try again.");
            }
            if (!clean.contains(url.trim())) clean.add(url.trim());
        }
        return clean;
    }

    /** Mutates the managed collection (orphanRemoval deletes dropped rows; replacing the list would throw). */
    private void replaceImages(Review review, List<String> urls) {
        review.getImages().clear();
        for (String url : urls) {
            review.getImages().add(ReviewImage.builder().review(review).imageUrl(url).build());
        }
        reviewRepository.saveAndFlush(review);
    }

    @org.springframework.beans.factory.annotation.Value("${app.reviews.max-images:4}")
    private int maxImages = 4;

    /** Uploads review photos to storage and returns their public URLs. */
    public List<String> uploadImages(Long userId, List<org.springframework.web.multipart.MultipartFile> files) throws java.io.IOException {
        accountVerificationService.requireVerifiedEmail(userId);
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("Choose at least one photo.");
        }
        if (files.size() > maxImages) {
            throw new IllegalArgumentException("You can attach up to " + maxImages + " photos.");
        }
        List<String> urls = new ArrayList<>();
        for (org.springframework.web.multipart.MultipartFile file : files) {
            urls.add(storageService.uploadReviewImage(file));
        }
        return urls;
    }

    /** Recomputed from the reviews table (under the advisory lock), then stored. */
    private void recalculateAndSaveSummary(Long productId) {
        int[] counts = new int[6];
        int total = 0;
        int sum = 0;
        for (Object[] row : reviewRepository.countRatingsByStar(productId)) {
            int rating = ((Number) row[0]).intValue();
            int count = ((Number) row[1]).intValue();
            if (rating >= 1 && rating <= 5) {
                counts[rating] = count;
                total += count;
                sum += rating * count;
            }
        }
        BigDecimal avg = total > 0
                ? BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2);

        ProductRatingSummary summary = ratingSummaryRepository.findById(productId)
                .orElseGet(() -> ProductRatingSummary.builder().productId(productId).build());
        summary.setAverageRating(avg);
        summary.setTotalReviews(total);
        summary.setRating1Count(counts[1]);
        summary.setRating2Count(counts[2]);
        summary.setRating3Count(counts[3]);
        summary.setRating4Count(counts[4]);
        summary.setRating5Count(counts[5]);
        summary.setUpdatedAt(OffsetDateTime.now());
        ratingSummaryRepository.save(summary);
    }

    /** After commit: stale rating, product card and recommendation data must not be served. */
    private void ratingChanged(Long productId, Long userId) {
        cache.evictRating(productId);
        cache.evictProduct(productId);
        cache.evictRecommendations();
    }

    private static String clean(String value) {
        if (value == null) return null;
        String trimmed = value.strip();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        action.run();
                    } catch (RuntimeException e) {
                        log.warn("Post-commit review step failed: {}", e.getClass().getSimpleName());
                    }
                }
            });
        } else {
            action.run();
        }
    }
}
