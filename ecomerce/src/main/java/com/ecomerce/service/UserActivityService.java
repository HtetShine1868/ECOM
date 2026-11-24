package com.ecomerce.service;

import com.ecomerce.entity.Product;
import com.ecomerce.entity.User;
import com.ecomerce.entity.UserProductEvent;
import com.ecomerce.entity.UserProductEvent.EventType;
import com.ecomerce.repository.ProductRepository;
import com.ecomerce.repository.UserProductEventRepository;
import com.ecomerce.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.TreeSet;

/**
 * Customer activity that feeds recommendations.
 *
 * <ul>
 *   <li>VIEW and SEARCH_CLICK come from the browser (the only place that knows a product page was
 *       opened). Everything else is recorded by the server from real actions, so a client cannot
 *       invent purchases or cart adds.</li>
 *   <li>Weights are decided here from configuration, never taken from the client.</li>
 *   <li>The same VIEW / SEARCH_CLICK by the same person inside the duplicate window counts once.</li>
 *   <li>Tracking is best-effort and runs in its own transaction: it can never fail or roll back a
 *       cart change or an order.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserActivityService {

    private final UserProductEventRepository eventRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final CoOccurrenceService coOccurrenceService;
    private final ProductCacheService cache;

    @Value("${app.activity.duplicate-window-minutes:10}")
    private int duplicateWindowMinutes = 10;

    @Value("${app.activity.weight.view:1}")
    private int weightView = 1;

    @Value("${app.activity.weight.search-click:3}")
    private int weightSearchClick = 3;

    @Value("${app.activity.weight.add-to-cart:5}")
    private int weightAddToCart = 5;

    @Value("${app.activity.weight.purchase:10}")
    private int weightPurchase = 10;

    public int weightOf(EventType type) {
        return switch (type) {
            case VIEW -> weightView;
            case SEARCH_CLICK -> weightSearchClick;
            case ADD_TO_CART -> weightAddToCart;
            case PURCHASE -> weightPurchase;
        };
    }

    /** What the browser may report. */
    public static boolean isClientReportable(EventType type) {
        return type == EventType.VIEW || type == EventType.SEARCH_CLICK;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordEvent(Long userId, Long productId, EventType type, String sessionId) {
        if (productId == null || type == null) return;
        if (userId == null && (sessionId == null || sessionId.isBlank())) return; // nobody to attribute it to
        String session = sessionId == null || sessionId.isBlank() ? null : sessionId.trim();
        if (session != null && session.length() > 100) session = session.substring(0, 100);

        if (type == EventType.VIEW || type == EventType.SEARCH_CLICK) {
            OffsetDateTime since = OffsetDateTime.now().minusMinutes(duplicateWindowMinutes);
            if (eventRepository.existsRecentDuplicate(userId, session, productId, type, since)) {
                return;
            }
        }
        Product product = productRepository.findById(productId).orElse(null);
        if (product == null || !Boolean.TRUE.equals(product.getActive())) return;
        User user = userId != null ? userRepository.findById(userId).orElse(null) : null;

        eventRepository.save(UserProductEvent.builder()
                .user(user)
                .product(product)
                .eventType(type)
                .eventWeight(weightOf(type))
                .sessionId(session)
                .build());
        if (userId != null && type != EventType.VIEW) {
            cache.evictUserRecommendations(userId);
        }
    }

    /** After a successful cart operation. Never throws. */
    public void recordCartAdd(Long userId, Long productId) {
        try {
            recordEvent(userId, productId, EventType.ADD_TO_CART, null);
        } catch (RuntimeException e) {
            log.warn("Could not record cart event: {}", e.getClass().getSimpleName());
        }
    }

    /**
     * One PURCHASE event per product of a placed order, plus one co-purchase count per product pair
     * (counted once per order regardless of quantity). Called after the order has committed.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordPurchase(Long userId, Collection<Long> productIds) {
        if (userId == null || productIds == null || productIds.isEmpty()) return;
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return;
        TreeSet<Long> distinct = new TreeSet<>(productIds);
        for (Long productId : distinct) {
            productRepository.findById(productId).ifPresent(product ->
                    eventRepository.save(UserProductEvent.builder()
                            .user(user)
                            .product(product)
                            .eventType(EventType.PURCHASE)
                            .eventWeight(weightPurchase)
                            .build()));
        }
        coOccurrenceService.recordCoPurchases(distinct);
        cache.evictUserRecommendations(userId);
    }
}
