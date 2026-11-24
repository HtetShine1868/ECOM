package com.ecomerce.service;

import com.ecomerce.common.infra.RedisAvailability;
import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.CategoryResponse;
import com.ecomerce.dto.ProductResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Cache-aside helper for public product and category reads.
 *
 * Keys (all with a TTL, all bounded):
 * <pre>
 *   product:{id}                                  one product detail
 *   categories:all                                category list
 *   products:popular:{categoryId|all}:{limit}     best-seller rail (limit is clamped by the caller)
 * </pre>
 *
 * Rules:
 * <ul>
 *   <li>Only public data is cached. No user-specific data lives under these keys.</li>
 *   <li>Cached stock/price are for display only. Checkout always reads PostgreSQL.</li>
 *   <li>Writers evict after their transaction commits (see callers' afterCommit hooks).</li>
 *   <li>Every call goes through {@link RedisAvailability}; when Redis is down reads miss
 *       and fall back to PostgreSQL.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProductCacheService {

    static final String PRODUCT_PREFIX = "product:";
    static final String CATEGORIES_ALL_KEY = "categories:all";
    static final String POPULAR_PREFIX = "products:popular:";
    static final String RATING_PREFIX = "product:rating:";
    public static final String REC_PREFIX = "recommendations:";

    private final StringRedisTemplate redis;
    private final RedisAvailability redisAvailability;
    private final ObjectMapper objectMapper;

    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();
    private final AtomicLong errors = new AtomicLong();

    @Value("${app.cache.ttl.product-seconds:300}")
    private long productTtlSeconds;

    @Value("${app.cache.ttl.category-seconds:600}")
    private long categoryTtlSeconds;

    @Value("${app.cache.ttl.listing-seconds:120}")
    private long listingTtlSeconds;

    @Value("${app.cache.ttl.rating-seconds:600}")
    private long ratingTtlSeconds;

    // ─── Products ────────────────────────────────────────────────────────────

    public Optional<ProductResponse> getProduct(Long id) {
        return read(PRODUCT_PREFIX + id, new TypeReference<>() {});
    }

    public void putProduct(ProductResponse product) {
        if (product == null || product.getId() == null) return;
        write(PRODUCT_PREFIX + product.getId(), product, productTtlSeconds);
    }

    /** Evict one product and every listing that could contain it. */
    public void evictProduct(Long id) {
        if (id == null) return;
        evictProducts(List.of(id));
    }

    public void evictProducts(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) return;
        List<String> keys = ids.stream().map(id -> PRODUCT_PREFIX + id).toList();
        redisAvailability.run("evictProducts", () -> redis.delete(keys));
        evictListings();
    }

    // ─── Best-seller listings ───────────────────────────────────────────────

    public Optional<List<BestSellerResponse>> getPopular(Long categoryId, int limit) {
        return read(popularKey(categoryId, limit), new TypeReference<>() {});
    }

    public void putPopular(Long categoryId, int limit, List<BestSellerResponse> list) {
        write(popularKey(categoryId, limit), list, listingTtlSeconds);
    }

    public void evictListings() {
        redisAvailability.run("evictListings", () -> deleteByPattern(POPULAR_PREFIX + "*"));
        evictRecommendations(); // product, price, stock or sales changed
    }

    static String popularKey(Long categoryId, int limit) {
        return POPULAR_PREFIX + (categoryId == null ? "all" : categoryId) + ":" + limit;
    }

    // ─── Rating summaries ───────────────────────────────────────────────────

    public Optional<com.ecomerce.dto.RatingSummaryResponse> getRating(Long productId) {
        return read(RATING_PREFIX + productId, new TypeReference<>() {});
    }

    public void putRating(com.ecomerce.dto.RatingSummaryResponse summary) {
        if (summary == null || summary.getProductId() == null) return;
        write(RATING_PREFIX + summary.getProductId(), summary, ratingTtlSeconds);
    }

    public void evictRating(Long productId) {
        if (productId == null) return;
        redisAvailability.run("evictRating", () -> redis.delete(RATING_PREFIX + productId));
    }

    // ─── Recommendation caches (ids and reasons only; price and stock are always re-read) ───

    public <T> Optional<T> getCached(String key, TypeReference<T> type) {
        return read(key, type);
    }

    public void putCached(String key, Object value, long ttlSeconds) {
        write(key, value, ttlSeconds);
    }

    /** One person's recommendations (their activity changed). */
    public void evictUserRecommendations(Long userId) {
        if (userId == null) return;
        redisAvailability.run("evictUserRecommendations", () -> redis.delete(REC_PREFIX + "user:" + userId));
    }

    /** Everything derived from products, sales or reviews: popular, related, bought-together, per-user. */
    public void evictRecommendations() {
        redisAvailability.run("evictRecommendations", () -> deleteByPattern(REC_PREFIX + "*"));
    }

    // ─── Categories ─────────────────────────────────────────────────────────

    public Optional<List<CategoryResponse>> getAllCategories() {
        return read(CATEGORIES_ALL_KEY, new TypeReference<>() {});
    }

    public void putAllCategories(List<CategoryResponse> categories) {
        if (categories == null) return;
        write(CATEGORIES_ALL_KEY, categories, categoryTtlSeconds);
    }

    public void evictCategories() {
        redisAvailability.run("evictCategories", () -> redis.delete(CATEGORIES_ALL_KEY));
        // Product payloads embed the category name, and listings filter by category.
        redisAvailability.run("evictProductKeys", () -> deleteByPattern(PRODUCT_PREFIX + "*"));
        evictListings();
    }

    // ─── Stats ──────────────────────────────────────────────────────────────

    public Map<String, Long> stats() {
        return Map.of("hits", hits.get(), "misses", misses.get(), "errors", errors.get());
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    private <T> Optional<T> read(String key, TypeReference<T> type) {
        if (!redisAvailability.isUsable()) {
            misses.incrementAndGet();
            return Optional.empty();
        }
        Optional<String> raw = redisAvailability.call("get " + keyFamily(key), () -> redis.opsForValue().get(key));
        if (raw.isEmpty()) {
            misses.incrementAndGet();
            return Optional.empty();
        }
        try {
            T value = objectMapper.readValue(raw.get(), type);
            hits.incrementAndGet();
            return Optional.ofNullable(value);
        } catch (Exception e) {
            // A corrupt or old-format entry: drop it and read the database.
            errors.incrementAndGet();
            log.warn("Discarding unreadable cache entry {}", keyFamily(key));
            redisAvailability.run("delete corrupt", () -> redis.delete(key));
            return Optional.empty();
        }
    }

    private void write(String key, Object value, long ttlSeconds) {
        String json;
        try {
            json = objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            errors.incrementAndGet();
            return;
        }
        if (!redisAvailability.run("set " + keyFamily(key),
                () -> redis.opsForValue().set(key, json, Duration.ofSeconds(Math.max(1, ttlSeconds))))) {
            if (redisAvailability.isEnabled()) errors.incrementAndGet();
        }
    }

    /** SCAN instead of KEYS so a large keyspace never blocks Redis. */
    private void deleteByPattern(String pattern) {
        List<String> batch = new ArrayList<>();
        try (Cursor<String> cursor = redis.scan(ScanOptions.scanOptions().match(pattern).count(200).build())) {
            while (cursor.hasNext()) {
                batch.add(cursor.next());
                if (batch.size() >= 200) {
                    redis.delete(new ArrayList<>(batch));
                    batch.clear();
                }
            }
        }
        if (!batch.isEmpty()) {
            redis.delete(batch);
        }
    }

    private static String keyFamily(String key) {
        int idx = key.indexOf(':');
        return idx > 0 ? key.substring(0, idx) : key;
    }
}
