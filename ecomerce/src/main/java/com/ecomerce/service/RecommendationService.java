package com.ecomerce.service;

import com.ecomerce.cart.CartService;
import com.ecomerce.dto.CartResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.dto.RecommendationItemResponse;
import com.ecomerce.entity.Product;
import com.ecomerce.entity.ProductCoOccurrence;
import com.ecomerce.entity.ProductRatingSummary;
import com.ecomerce.entity.UserProductEvent;
import com.ecomerce.entity.UserProductEvent.EventType;
import com.ecomerce.repository.ProductCoOccurrenceRepository;
import com.ecomerce.repository.ProductRatingSummaryRepository;
import com.ecomerce.repository.ProductRepository;
import com.ecomerce.repository.UserProductEventRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Recommendations, computed in Java from PostgreSQL data (no external AI service).
 *
 * <h3>Personalised ("for you")</h3>
 * Every candidate gets four scores, each 0-100:
 * <ul>
 *   <li><b>content</b>: how well it matches the shopper's interests: category affinity (65%) and
 *       closeness to the prices they look at (35%).</li>
 *   <li><b>behavior</b>: bought together with things they interacted with (60%) and direct interest in
 *       the product itself, such as viewed or added to the bag (40%).</li>
 *   <li><b>popularity</b>: recent weighted activity (purchases count more than views) and units sold.</li>
 *   <li><b>rating</b>: average review rating, shrunk toward neutral when there are few reviews.</li>
 * </ul>
 * {@code final = content*w1 + behavior*w2 + popularity*w3 + rating*w4} (weights from configuration).
 * All the shopper's events are decayed with {@code weight * exp(-lambda * ageInDays)}, so recent
 * activity matters most. Interests are rebuilt on every computation, so a shopper is never locked into
 * one category.
 *
 * <h3>Rules</h3>
 * Only active, in-stock products; never the current product; no duplicates; products already bought are
 * left out of "for you"; one category cannot fill the whole list; ties break by units sold, then id
 * (deterministic). Too little activity means popular products, never invented personalisation.
 *
 * <h3>Caching</h3>
 * Redis keeps only product IDs, reasons and scores. Every response re-reads price, stock and rating from
 * PostgreSQL, so a stale cache entry can never show a wrong price or recommend a sold-out item.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RecommendationService {

    /** What is cached: no price, no stock. */
    public record CachedRec(Long productId, String type, String reason, double score) {
    }

    private final ProductRepository productRepository;
    private final UserProductEventRepository eventRepository;
    private final ProductRatingSummaryRepository ratingSummaryRepository;
    private final ProductCoOccurrenceRepository coOccurrenceRepository;
    private final CoOccurrenceService coOccurrenceService;
    private final ProductCacheService cache;
    private final RatingEnricher ratingEnricher;
    private final CartService cartService;

    @Value("${app.recommendations.weight.content:0.40}")
    private double contentWeight = 0.40;
    @Value("${app.recommendations.weight.behavior:0.30}")
    private double behaviorWeight = 0.30;
    @Value("${app.recommendations.weight.popularity:0.20}")
    private double popularityWeight = 0.20;
    @Value("${app.recommendations.weight.rating:0.10}")
    private double ratingWeight = 0.10;
    @Value("${app.recommendations.decay-lambda:0.05}")
    private double decayLambda = 0.05;
    @Value("${app.recommendations.history-days:90}")
    private int historyDays = 90;
    @Value("${app.recommendations.min-events:3}")
    private int minEvents = 3;
    @Value("${app.recommendations.popularity-days:30}")
    private int popularityDays = 30;
    @Value("${app.recommendations.max-candidates:500}")
    private int maxCandidates = 500;
    @Value("${app.recommendations.default-limit:8}")
    private int defaultLimit = 8;
    @Value("${app.recommendations.max-limit:20}")
    private int maxLimit = 20;
    @Value("${app.recommendations.max-category-share:0.5}")
    private double maxCategoryShare = 0.5;
    @Value("${app.cache.ttl.rec-user-seconds:900}")
    private long ttlUser = 900;
    @Value("${app.cache.ttl.rec-related-seconds:1800}")
    private long ttlRelated = 1800;
    @Value("${app.cache.ttl.rec-popular-seconds:600}")
    private long ttlPopular = 600;
    @Value("${app.cache.ttl.rec-bought-together-seconds:1800}")
    private long ttlBought = 1800;

    // ─── Public API ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getPersonalizedRecommendations(Long userId, int limit) {
        int n = clamp(limit);
        if (userId == null) {
            return getPopularProducts(n);
        }
        String key = ProductCacheService.REC_PREFIX + "user:" + userId;
        List<RecommendationItemResponse> hit = fromCache(key, n, Set.of());
        if (!hit.isEmpty()) return hit;

        List<CachedRec> computed = computeForUser(userId);
        if (computed == null) {
            return getPopularProducts(n); // not enough activity: honest fallback
        }
        cache.putCached(key, computed, ttlUser);
        return hydrate(computed, n, Set.of());
    }

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getRelatedProducts(Long productId, int limit) {
        int n = clamp(limit);
        String key = ProductCacheService.REC_PREFIX + "related:" + productId;
        List<RecommendationItemResponse> hit = fromCache(key, n, Set.of(productId));
        if (!hit.isEmpty()) return hit;

        Product base = productRepository.findAllWithCategory(List.of(productId)).stream().findFirst().orElse(null);
        if (base == null) return List.of();
        List<CachedRec> computed = computeRelated(base);
        cache.putCached(key, computed, ttlRelated);
        return hydrate(computed, n, Set.of(productId));
    }

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getPopularProducts(int limit) {
        int n = clamp(limit);
        String key = ProductCacheService.REC_PREFIX + "popular";
        List<RecommendationItemResponse> hit = fromCache(key, n, Set.of());
        if (!hit.isEmpty()) return hit;

        List<CachedRec> computed = computePopular();
        cache.putCached(key, computed, ttlPopular);
        return hydrate(computed, n, Set.of());
    }

    /** Only products that were really bought together with this one; nothing is made up. */
    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getFrequentlyBoughtTogether(Long productId, int limit) {
        int n = Math.min(clamp(limit), 8);
        String key = ProductCacheService.REC_PREFIX + "frequently-bought:" + productId;
        Optional<List<CachedRec>> cached = cache.getCached(key, new TypeReference<List<CachedRec>>() {});
        List<CachedRec> recs;
        if (cached.isPresent()) {
            recs = cached.get();
        } else {
            recs = new ArrayList<>();
            double rank = 100;
            for (Long id : coOccurrenceService.getFrequentlyBoughtTogetherProductIds(productId, maxLimit)) {
                recs.add(new CachedRec(id, "FREQUENTLY_BOUGHT", "Customers often buy this together with it", rank));
                rank = Math.max(1, rank - 1);
            }
            cache.putCached(key, recs, ttlBought);
        }
        return hydrate(recs, n, Set.of(productId));
    }

    /** "You may also like" for the bag: goes with what is in it, then what the shopper likes. */
    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getCartRecommendations(Long userId, int limit) {
        int n = clamp(limit);
        Set<Long> inBag = new HashSet<>();
        try {
            CartResponse cart = cartService.getCart(userId);
            if (cart.getItems() != null) cart.getItems().forEach(i -> inBag.add(i.getProductId()));
        } catch (RuntimeException e) {
            log.debug("Bag unavailable for recommendations: {}", e.getClass().getSimpleName());
        }
        if (inBag.isEmpty()) {
            return getPersonalizedRecommendations(userId, n);
        }

        List<Product> candidates = candidates();
        Map<Long, Double> together = coPurchaseSignal(inBag, null);
        Map<Long, ProductRatingSummary> ratings = ratings();
        Profile profile = profileOf(userId);
        double maxTogether = together.values().stream().mapToDouble(d -> d).max().orElse(0);

        List<Scored> scored = new ArrayList<>();
        for (Product p : candidates) {
            if (inBag.contains(p.getId())) continue;
            double goesWith = maxTogether > 0 ? together.getOrDefault(p.getId(), 0.0) / maxTogether * 100 : 0;
            double likes = profile == null ? 0 : profile.contentScore(p);
            double rating = ratingScore(ratings.get(p.getId()));
            double score = goesWith * 0.55 + likes * 0.25 + rating * 0.10 + popularityOf(p) * 0.10;
            String reason = goesWith > 0 ? "Goes well with what's in your bag"
                    : likes > 40 ? "Because of what you've been browsing" : "Popular with other shoppers";
            scored.add(new Scored(p, score, "CART", reason));
        }
        return hydrate(select(scored, n, true), n, inBag);
    }

    @Transactional(readOnly = true)
    public List<RecommendationItemResponse> getRecentlyViewed(Long userId, String sessionId, int limit) {
        int n = Math.min(clamp(limit), 12);
        List<UserProductEvent> events;
        if (userId != null) {
            events = eventRepository.findRecentByUser(userId, PageRequest.of(0, 60));
        } else if (sessionId != null && !sessionId.isBlank()) {
            events = eventRepository.findRecentBySession(sessionId.trim(), PageRequest.of(0, 60));
        } else {
            return List.of();
        }
        Set<Long> ids = new LinkedHashSet<>();
        for (UserProductEvent ev : events) {
            if (ev.getEventType() == EventType.VIEW && ev.getProduct() != null) ids.add(ev.getProduct().getId());
            if (ids.size() >= n * 2) break;
        }
        List<CachedRec> recs = new ArrayList<>();
        double rank = 100;
        for (Long id : ids) {
            recs.add(new CachedRec(id, "RECENTLY_VIEWED", "You looked at this recently", rank));
            rank -= 1;
        }
        // Recently viewed is a convenience list, so sold-out items stay visible (marked unavailable).
        return hydrate(recs, n, Set.of(), true);
    }

    // ─── Computation ────────────────────────────────────────────────────────

    /** Returns null when the shopper has too little activity to personalise. */
    private List<CachedRec> computeForUser(Long userId) {
        Profile profile = profileOf(userId);
        if (profile == null) return null;

        List<Product> candidates = candidates();
        if (candidates.isEmpty()) return List.of();

        Map<Long, Double> together = coPurchaseSignal(profile.topProducts(20), profile.interest);
        double maxTogether = together.values().stream().mapToDouble(d -> d).max().orElse(0);
        double maxDirect = profile.interest.values().stream().mapToDouble(d -> d).max().orElse(0);
        Map<Long, ProductRatingSummary> ratings = ratings();

        List<Scored> scored = new ArrayList<>();
        for (Product p : candidates) {
            if (profile.purchased.contains(p.getId())) continue;
            double content = profile.contentScore(p);
            double coScore = maxTogether > 0 ? together.getOrDefault(p.getId(), 0.0) / maxTogether * 100 : 0;
            double direct = maxDirect > 0 ? profile.interest.getOrDefault(p.getId(), 0.0) / maxDirect * 100 : 0;
            double behavior = 0.6 * coScore + 0.4 * direct;
            double popularity = popularityOf(p);
            double rating = ratingScore(ratings.get(p.getId()));

            double c = content * contentWeight, b = behavior * behaviorWeight;
            double pop = popularity * popularityWeight, r = rating * ratingWeight;
            String catName = p.getCategory() == null ? "this category" : p.getCategory().getName();
            String reason;
            if (c >= b && c >= pop && c >= r && content > 0) {
                reason = "Because you've been looking at " + catName;
            } else if (b >= pop && b >= r && behavior > 0) {
                reason = coScore >= direct ? "Goes with items you bought or viewed" : "You showed interest in this";
            } else if (pop >= r) {
                reason = "Popular right now";
            } else {
                reason = "Highly rated";
            }
            scored.add(new Scored(p, c + b + pop + r, "FOR_YOU", reason));
        }
        return select(scored, maxLimit, true);
    }

    private List<CachedRec> computeRelated(Product base) {
        List<Product> candidates = candidates();
        Map<Long, Double> together = coPurchaseSignal(Set.of(base.getId()), null);
        double maxTogether = together.values().stream().mapToDouble(d -> d).max().orElse(0);
        Map<Long, ProductRatingSummary> ratings = ratings();
        double baseLogPrice = Math.log(Math.max(1.0, base.getPrice().doubleValue()));

        List<Scored> scored = new ArrayList<>();
        for (Product p : candidates) {
            if (p.getId().equals(base.getId())) continue;
            boolean sameCategory = base.getCategory() != null && p.getCategory() != null
                    && base.getCategory().getId().equals(p.getCategory().getId());
            double priceSim = 100 * Math.exp(-Math.pow(Math.log(Math.max(1.0, p.getPrice().doubleValue())) - baseLogPrice, 2) / (2 * 0.6 * 0.6));
            double goes = maxTogether > 0 ? together.getOrDefault(p.getId(), 0.0) / maxTogether * 100 : 0;
            double score = (sameCategory ? 50 : 0) + priceSim * 0.2 + goes * 0.2
                    + ratingScore(ratings.get(p.getId())) * 0.05 + popularityOf(p) * 0.05;
            if (!sameCategory && goes == 0) score *= 0.4; // unrelated products rank below real matches
            String reason = goes > 0 ? "Often bought with " + base.getName()
                    : sameCategory ? "More from " + base.getCategory().getName() : "Similar price";
            scored.add(new Scored(p, score, "RELATED", reason));
        }
        return select(scored, maxLimit, false);
    }

    private List<CachedRec> computePopular() {
        List<Product> candidates = candidates();
        Map<Long, ProductRatingSummary> ratings = ratings();
        List<Scored> scored = new ArrayList<>();
        for (Product p : candidates) {
            double pop = popularityOf(p);
            double score = pop * 0.85 + ratingScore(ratings.get(p.getId())) * 0.15;
            scored.add(new Scored(p, score, "POPULAR", pop > 0 ? "Popular with shoppers" : "New in the shop"));
        }
        return select(scored, maxLimit, false);
    }

    // ─── Profile, signals ───────────────────────────────────────────────────

    /** What one shopper is interested in right now. Null when there is too little activity. */
    private Profile profileOf(Long userId) {
        OffsetDateTime now = OffsetDateTime.now();
        List<UserProductEvent> events = eventRepository.findByUserSince(userId, now.minusDays(historyDays), PageRequest.of(0, 300));
        if (events.size() < minEvents) return null;

        Profile profile = new Profile();
        double sumW = 0, sumLog = 0, sumLog2 = 0;
        for (UserProductEvent ev : events) {
            Product p = ev.getProduct();
            if (p == null) continue;
            double ageDays = Math.max(0, Duration.between(ev.getCreatedAt(), now).toHours() / 24.0);
            double w = ev.getEventWeight() * Math.exp(-decayLambda * ageDays); // effectiveWeight
            if (ev.getEventType() == EventType.PURCHASE) profile.purchased.add(p.getId());
            profile.interest.merge(p.getId(), w, Double::sum);
            if (p.getCategory() != null) profile.category.merge(p.getCategory().getId(), w, Double::sum);
            double lp = Math.log(Math.max(1.0, p.getPrice().doubleValue()));
            sumW += w;
            sumLog += w * lp;
            sumLog2 += w * lp * lp;
        }
        if (profile.interest.isEmpty() || sumW <= 0) return null;
        profile.maxCategory = profile.category.values().stream().mapToDouble(d -> d).max().orElse(0);
        profile.meanLogPrice = sumLog / sumW;
        double variance = Math.max(0, sumLog2 / sumW - profile.meanLogPrice * profile.meanLogPrice);
        profile.sdLogPrice = Math.max(0.5, Math.sqrt(variance)); // never a needle-thin band
        return profile;
    }

    /**
     * For each product, how strongly it was co-purchased with the seeds. When {@code weights} is given,
     * each seed counts in proportion to the shopper's (decayed) interest in it.
     */
    private Map<Long, Double> coPurchaseSignal(Collection<Long> seeds, Map<Long, Double> weights) {
        Map<Long, Double> out = new HashMap<>();
        if (seeds == null || seeds.isEmpty()) return out;
        Set<Long> seedSet = new HashSet<>(seeds);
        List<ProductCoOccurrence> rows = coOccurrenceRepository.findInvolving(seedSet);
        int maxCount = rows.stream().mapToInt(ProductCoOccurrence::getCoPurchaseCount).max().orElse(1);
        for (ProductCoOccurrence row : rows) {
            boolean aSeed = seedSet.contains(row.getProductAId());
            Long seed = aSeed ? row.getProductAId() : row.getProductBId();
            Long other = aSeed ? row.getProductBId() : row.getProductAId();
            if (seedSet.contains(other)) continue;
            double w = weights == null ? 1.0 : weights.getOrDefault(seed, 0.0);
            out.merge(other, w * row.getCoPurchaseCount() / (double) maxCount, Double::sum);
        }
        return out;
    }

    private double popularityOf(Product p) {
        return popularityScores().getOrDefault(p.getId(), 0.0);
    }

    private Map<Long, Double> popularityCache;
    private long popularityCacheAt;

    /**
     * 0-100 per product: 60% recent weighted activity (purchases weigh most, views least) and 40%
     * units sold (log-scaled). Recomputed at most every 30 seconds per instance.
     */
    private synchronized Map<Long, Double> popularityScores() {
        long now = System.currentTimeMillis();
        if (popularityCache != null && now - popularityCacheAt < 30_000) return popularityCache;

        Map<Long, Double> recent = new HashMap<>();
        for (Object[] row : eventRepository.findPopularProductScores(OffsetDateTime.now().minusDays(popularityDays), PageRequest.of(0, 1000))) {
            recent.put(((Number) row[0]).longValue(), ((Number) row[1]).doubleValue());
        }
        double maxRecent = recent.values().stream().mapToDouble(d -> d).max().orElse(0);
        List<Product> all = candidates();
        double maxUnits = all.stream().mapToDouble(p -> p.getUnitsSold() == null ? 0 : p.getUnitsSold()).max().orElse(0);

        Map<Long, Double> result = new HashMap<>();
        for (Product p : all) {
            double r = maxRecent > 0 ? recent.getOrDefault(p.getId(), 0.0) / maxRecent : 0;
            double u = maxUnits > 0 ? Math.log1p(p.getUnitsSold() == null ? 0 : p.getUnitsSold()) / Math.log1p(maxUnits) : 0;
            result.put(p.getId(), 100 * (0.6 * r + 0.4 * u));
        }
        popularityCache = result;
        popularityCacheAt = now;
        return result;
    }

    /** Average rating shrunk toward neutral when there are few reviews, so one 5-star review is not a "top rated" product. */
    private static double ratingScore(ProductRatingSummary s) {
        double prior = 3.0, strength = 5.0;
        double avg = s == null || s.getAverageRating() == null ? 0 : s.getAverageRating().doubleValue();
        int n = s == null || s.getTotalReviews() == null ? 0 : s.getTotalReviews();
        return (avg * n + prior * strength) / (n + strength) / 5.0 * 100;
    }

    private List<Product> candidates() {
        return productRepository.findRecommendable(PageRequest.of(0, maxCandidates,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"))));
    }

    private Map<Long, ProductRatingSummary> ratings() {
        return ratingSummaryRepository.findAll().stream()
                .collect(Collectors.toMap(ProductRatingSummary::getProductId, s -> s));
    }

    // ─── Selection and output ───────────────────────────────────────────────

    private record Scored(Product product, double score, String type, String reason) {
    }

    /**
     * Highest score first; ties by units sold, then id. When {@code diversify}, one category may take at
     * most maxCategoryShare of the list (extra slots are filled afterwards so the list is never short).
     */
    private List<CachedRec> select(List<Scored> scored, int limit, boolean diversify) {
        Comparator<Scored> order = Comparator.comparingDouble(Scored::score).reversed()
                .thenComparing(Comparator.comparingLong((Scored s) -> s.product().getUnitsSold() == null ? 0L : s.product().getUnitsSold()).reversed())
                .thenComparing(s -> s.product().getId());
        List<Scored> sorted = scored.stream().sorted(order).toList();

        List<Scored> picked = new ArrayList<>();
        if (diversify) {
            int cap = Math.max(1, (int) Math.ceil(limit * maxCategoryShare));
            Map<Long, Integer> perCategory = new HashMap<>();
            for (Scored s : sorted) {
                if (picked.size() >= limit) break;
                Long cat = s.product().getCategory() == null ? -1L : s.product().getCategory().getId();
                if (perCategory.getOrDefault(cat, 0) >= cap) continue;
                perCategory.merge(cat, 1, Integer::sum);
                picked.add(s);
            }
            for (Scored s : sorted) {
                if (picked.size() >= limit) break;
                if (!picked.contains(s)) picked.add(s);
            }
            picked.sort(order);
        } else {
            picked.addAll(sorted.stream().limit(limit).toList());
        }
        return picked.stream()
                .map(s -> new CachedRec(s.product().getId(), s.type(), s.reason(), Math.round(s.score() * 100.0) / 100.0))
                .toList();
    }

    private List<RecommendationItemResponse> fromCache(String key, int n, Set<Long> exclude) {
        Optional<List<CachedRec>> cached = cache.getCached(key, new TypeReference<List<CachedRec>>() {});
        if (cached.isEmpty() || cached.get().isEmpty()) return List.of();
        return hydrate(cached.get(), n, exclude);
    }

    private List<RecommendationItemResponse> hydrate(List<CachedRec> recs, int n, Set<Long> exclude) {
        return hydrate(recs, n, exclude, false);
    }

    /**
     * Turns cached ids into full products using the CURRENT database row (price, stock, status) and
     * rating. Anything no longer sold (or, unless {@code keepSoldOut}, no longer in stock) is dropped.
     */
    private List<RecommendationItemResponse> hydrate(List<CachedRec> recs, int n, Set<Long> exclude, boolean keepSoldOut) {
        if (recs == null || recs.isEmpty()) return List.of();
        List<Long> ids = recs.stream().map(CachedRec::productId).filter(id -> !exclude.contains(id)).distinct().toList();
        Map<Long, Product> byId = productRepository.findAllWithCategory(ids).stream()
                .collect(Collectors.toMap(Product::getId, p -> p));

        List<RecommendationItemResponse> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (CachedRec rec : recs) {
            if (out.size() >= n) break;
            Product p = byId.get(rec.productId());
            if (p == null || !Boolean.TRUE.equals(p.getActive()) || !seen.add(p.getId())) continue;
            if (!keepSoldOut && (p.getStock() == null || p.getStock() <= 0)) continue;
            out.add(RecommendationItemResponse.builder()
                    .product(ProductResponse.from(p))
                    .recommendationType(rec.type())
                    .reason(rec.reason())
                    .score(rec.score())
                    .build());
        }
        ratingEnricher.enrichAll(out.stream().map(RecommendationItemResponse::getProduct).collect(Collectors.toCollection(ArrayList::new)));
        return out;
    }

    private int clamp(int limit) {
        return Math.min(Math.max(1, limit <= 0 ? defaultLimit : limit), maxLimit);
    }

    /** One shopper's decayed interests. */
    private static class Profile {
        final Map<Long, Double> interest = new LinkedHashMap<>();   // productId -> decayed weight
        final Map<Long, Double> category = new HashMap<>();         // categoryId -> decayed weight
        final Set<Long> purchased = new HashSet<>();
        double maxCategory;
        double meanLogPrice;
        double sdLogPrice = 0.5;

        Set<Long> topProducts(int n) {
            return interest.entrySet().stream()
                    .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                    .limit(n).map(Map.Entry::getKey).collect(Collectors.toCollection(LinkedHashSet::new));
        }

        /** 0-100: category affinity (65%) + price closeness (35%). */
        double contentScore(Product p) {
            double cat = 0;
            if (p.getCategory() != null && maxCategory > 0) {
                cat = category.getOrDefault(p.getCategory().getId(), 0.0) / maxCategory;
            }
            double z = (Math.log(Math.max(1.0, p.getPrice().doubleValue())) - meanLogPrice) / sdLogPrice;
            double price = Math.exp(-0.5 * z * z);
            return 100 * (0.65 * cat + 0.35 * price);
        }
    }
}
