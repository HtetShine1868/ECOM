package com.ecomerce.service;

import com.ecomerce.dto.ProductResponse;
import com.ecomerce.dto.RecommendationItemResponse;
import com.ecomerce.entity.Product;
import com.ecomerce.entity.ProductRatingSummary;
import com.ecomerce.entity.UserProductEvent;
import com.ecomerce.repository.ProductRatingSummaryRepository;
import com.ecomerce.repository.ProductRepository;
import com.ecomerce.repository.UserProductEventRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class RecommendationService {

    private final ProductRepository productRepository;
    private final UserProductEventRepository eventRepository;
    private final ProductRatingSummaryRepository ratingSummaryRepository;
    private final CoOccurrenceService coOccurrenceService;
    private final Optional<StringRedisTemplate> redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.recommendations.weight.content:0.40}")
    private double contentWeight = 0.40;

    @Value("${app.recommendations.weight.behavior:0.30}")
    private double behaviorWeight = 0.30;

    @Value("${app.recommendations.weight.popularity:0.20}")
    private double popularityWeight = 0.20;

    @Value("${app.recommendations.weight.rating:0.10}")
    private double ratingWeight = 0.10;

    @Value("${app.recommendations.decay-lambda:0.1}")
    private double decayLambda = 0.1;

    private static final String CACHE_FOR_YOU_PREFIX = "recommendations:user:";
    private static final String CACHE_RELATED_PREFIX = "recommendations:related:";
    private static final String CACHE_POPULAR = "recommendations:popular";
    private static final String CACHE_FREQ_BOUGHT_PREFIX = "recommendations:frequently-bought:";

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getPersonalizedRecommendations(Long userId, int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 20);

        if (userId == null) {
            return getPopularProducts(safeLimit);
        }

        // Try cache
        String cacheKey = CACHE_FOR_YOU_PREFIX + userId;
        List<RecommendationItemResponse> cached = getFromCache(cacheKey, new TypeReference<>() {});
        if (cached != null && !cached.isEmpty()) {
            return cached.stream().limit(safeLimit).toList();
        }

        // Fetch user events in last 30 days
        Pageable recentLimit = PageRequest.of(0, 50);
        List<UserProductEvent> userEvents = eventRepository.findRecentByUser(userId, recentLimit);

        if (userEvents.isEmpty()) {
            // New user fallback to popular
            return getPopularProducts(safeLimit);
        }

        OffsetDateTime now = OffsetDateTime.now();

        // Calculate category interests with time decay
        Map<Long, Double> categoryScores = new HashMap<>();
        Set<Long> interactedProductIds = new HashSet<>();

        for (UserProductEvent ev : userEvents) {
            Product p = ev.getProduct();
            if (p == null) continue;
            interactedProductIds.add(p.getId());

            double ageInDays = Math.max(0, ChronoUnit.HOURS.between(ev.getCreatedAt(), now) / 24.0);
            double effectiveWeight = ev.getEventWeight() * Math.exp(-decayLambda * ageInDays);

            if (p.getCategory() != null) {
                categoryScores.merge(p.getCategory().getId(), effectiveWeight, Double::sum);
            }
        }

        // Get candidate products: active, in-stock
        List<Product> candidates = productRepository.findAll().stream()
                .filter(p -> Boolean.TRUE.equals(p.getActive()) && p.getStock() > 0)
                .toList();

        if (candidates.isEmpty()) {
            return Collections.emptyList();
        }

        // Fetch rating summaries
        Map<Long, ProductRatingSummary> summaries = ratingSummaryRepository.findAll().stream()
                .collect(Collectors.toMap(ProductRatingSummary::getProductId, s -> s));

        // Popularity scores (unitsSold / sales)
        double maxSales = candidates.stream().mapToDouble(p -> p.getUnitsSold() != null ? p.getUnitsSold() : 0).max().orElse(1.0);
        if (maxSales == 0) maxSales = 1.0;

        double maxCategoryScore = categoryScores.values().stream().mapToDouble(v -> v).max().orElse(1.0);
        if (maxCategoryScore == 0) maxCategoryScore = 1.0;

        List<ScoredProduct> scored = new ArrayList<>();
        for (Product p : candidates) {
            // Content score based on category preference
            double contentScore = 0.0;
            if (p.getCategory() != null && categoryScores.containsKey(p.getCategory().getId())) {
                contentScore = (categoryScores.get(p.getCategory().getId()) / maxCategoryScore) * 100.0;
            }

            // Behavior score: higher if recently interacted or related
            double behaviorScore = interactedProductIds.contains(p.getId()) ? 20.0 : 50.0;

            // Popularity score
            double sales = p.getUnitsSold() != null ? p.getUnitsSold() : 0;
            double popularityScore = (sales / maxSales) * 100.0;

            // Rating score
            double ratingScore = 0.0;
            ProductRatingSummary sum = summaries.get(p.getId());
            if (sum != null && sum.getAverageRating() != null) {
                ratingScore = (sum.getAverageRating().doubleValue() / 5.0) * 100.0;
            }

            double finalScore = (contentScore * contentWeight) +
                                (behaviorScore * behaviorWeight) +
                                (popularityScore * popularityWeight) +
                                (ratingScore * ratingWeight);

            String reason = contentScore > 30.0 ? "Based on items you like in " + (p.getCategory() != null ? p.getCategory().getName() : "this category")
                    : popularityScore > 40.0 ? "Trending popular choice" : "Recommended for you";

            scored.add(new ScoredProduct(p, finalScore, "FOR_YOU", reason));
        }

        scored.sort(Comparator.comparingDouble(ScoredProduct::score).reversed());

        List<RecommendationItemResponse> results = scored.stream()
                .limit(safeLimit)
                .map(sp -> RecommendationItemResponse.builder()
                        .product(ProductResponse.from(sp.product()))
                        .recommendationType(sp.type())
                        .reason(sp.reason())
                        .score(Math.round(sp.score() * 100.0) / 100.0)
                        .build())
                .toList();

        putInCache(cacheKey, results, Duration.ofMinutes(15));
        return results;
    }

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getRelatedProducts(Long productId, int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 12);
        String cacheKey = CACHE_RELATED_PREFIX + productId;

        List<RecommendationItemResponse> cached = getFromCache(cacheKey, new TypeReference<>() {});
        if (cached != null && !cached.isEmpty()) {
            return cached.stream().limit(safeLimit).toList();
        }

        Product base = productRepository.findById(productId).orElse(null);
        if (base == null) return Collections.emptyList();

        List<Product> candidates = productRepository.findAll().stream()
                .filter(p -> !p.getId().equals(productId) && Boolean.TRUE.equals(p.getActive()) && p.getStock() > 0)
                .toList();

        List<RecommendationItemResponse> results = candidates.stream()
                .filter(p -> p.getCategory() != null && base.getCategory() != null &&
                             p.getCategory().getId().equals(base.getCategory().getId()))
                .limit(safeLimit)
                .map(p -> RecommendationItemResponse.builder()
                        .product(ProductResponse.from(p))
                        .recommendationType("RELATED")
                        .reason("Similar item in " + base.getCategory().getName())
                        .score(85.0)
                        .build())
                .collect(Collectors.toList());

        // If fewer than limit, fill with popular items
        if (results.size() < safeLimit) {
            List<RecommendationItemResponse> popular = getPopularProducts(safeLimit - results.size());
            for (RecommendationItemResponse pop : popular) {
                if (!pop.getProduct().getId().equals(productId) &&
                    results.stream().noneMatch(r -> r.getProduct().getId().equals(pop.getProduct().getId()))) {
                    results.add(pop);
                }
            }
        }

        putInCache(cacheKey, results, Duration.ofMinutes(30));
        return results;
    }

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getPopularProducts(int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 20);

        List<RecommendationItemResponse> cached = getFromCache(CACHE_POPULAR, new TypeReference<>() {});
        if (cached != null && !cached.isEmpty()) {
            return cached.stream().limit(safeLimit).toList();
        }

        List<Product> activeProducts = productRepository.findAll().stream()
                .filter(p -> Boolean.TRUE.equals(p.getActive()) && p.getStock() > 0)
                .sorted((a, b) -> {
                    long soldA = a.getUnitsSold() != null ? a.getUnitsSold() : 0L;
                    long soldB = b.getUnitsSold() != null ? b.getUnitsSold() : 0L;
                    return Long.compare(soldB, soldA);
                })
                .limit(safeLimit)
                .toList();

        List<RecommendationItemResponse> results = activeProducts.stream()
                .map(p -> RecommendationItemResponse.builder()
                        .product(ProductResponse.from(p))
                        .recommendationType("POPULAR")
                        .reason("Popular choice among shoppers")
                        .score(90.0)
                        .build())
                .toList();

        putInCache(CACHE_POPULAR, results, Duration.ofMinutes(10));
        return results;
    }

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getFrequentlyBoughtTogether(Long productId, int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 8);
        String cacheKey = CACHE_FREQ_BOUGHT_PREFIX + productId;

        List<RecommendationItemResponse> cached = getFromCache(cacheKey, new TypeReference<>() {});
        if (cached != null && !cached.isEmpty()) {
            return cached.stream().limit(safeLimit).toList();
        }

        List<Long> freqIds = coOccurrenceService.getFrequentlyBoughtTogetherProductIds(productId, safeLimit);
        List<RecommendationItemResponse> results = new ArrayList<>();

        if (!freqIds.isEmpty()) {
            List<Product> products = productRepository.findAllById(freqIds).stream()
                    .filter(p -> Boolean.TRUE.equals(p.getActive()) && p.getStock() > 0)
                    .toList();

            for (Product p : products) {
                results.add(RecommendationItemResponse.builder()
                        .product(ProductResponse.from(p))
                        .recommendationType("FREQUENTLY_BOUGHT")
                        .reason("Frequently bought together with this product")
                        .score(95.0)
                        .build());
            }
        }

        // Fallback to related if empty
        if (results.isEmpty()) {
            results = getRelatedProducts(productId, safeLimit);
        }

        putInCache(cacheKey, results, Duration.ofMinutes(30));
        return results;
    }

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getRecentlyViewed(Long userId, String sessionId, int limit) {
        int safeLimit = Math.min(Math.max(1, limit), 12);
        Pageable pageable = PageRequest.of(0, 30);
        List<UserProductEvent> events;

        if (userId != null) {
            events = eventRepository.findRecentByUser(userId, pageable);
        } else if (sessionId != null && !sessionId.isBlank()) {
            events = eventRepository.findRecentBySession(sessionId, pageable);
        } else {
            return Collections.emptyList();
        }

        Set<Long> seenIds = new LinkedHashSet<>();
        for (UserProductEvent ev : events) {
            if (ev.getEventType() == UserProductEvent.EventType.VIEW && ev.getProduct() != null) {
                seenIds.add(ev.getProduct().getId());
                if (seenIds.size() >= safeLimit) break;
            }
        }

        if (seenIds.isEmpty()) {
            return Collections.emptyList();
        }

        Map<Long, Product> productMap = productRepository.findAllById(seenIds).stream()
                .filter(p -> Boolean.TRUE.equals(p.getActive()))
                .collect(Collectors.toMap(Product::getId, p -> p));

        List<RecommendationItemResponse> results = new ArrayList<>();
        for (Long id : seenIds) {
            Product p = productMap.get(id);
            if (p != null) {
                results.add(RecommendationItemResponse.builder()
                        .product(ProductResponse.from(p))
                        .recommendationType("RECENTLY_VIEWED")
                        .reason("Recently viewed by you")
                        .score(100.0)
                        .build());
            }
        }

        return results;
    }

    private <T> T getFromCache(String key, TypeReference<T> typeRef) {
        if (redisTemplate.isEmpty()) return null;
        try {
            String json = redisTemplate.get().opsForValue().get(key);
            if (json != null && !json.isBlank()) {
                return objectMapper.readValue(json, typeRef);
            }
        } catch (Exception e) {
            log.debug("Redis cache read failed for key {}: {}", key, e.getMessage());
        }
        return null;
    }

    private void putInCache(String key, Object value, Duration ttl) {
        if (redisTemplate.isEmpty() || value == null) return;
        try {
            String json = objectMapper.writeValueAsString(value);
            redisTemplate.get().opsForValue().set(key, json, ttl);
        } catch (Exception e) {
            log.debug("Redis cache write failed for key {}: {}", key, e.getMessage());
        }
    }

    private record ScoredProduct(Product product, double score, String type, String reason) {}
}
