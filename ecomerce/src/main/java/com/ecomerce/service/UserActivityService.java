package com.ecomerce.service;

import com.ecomerce.entity.Order;
import com.ecomerce.entity.OrderItem;
import com.ecomerce.entity.Product;
import com.ecomerce.entity.User;
import com.ecomerce.entity.UserProductEvent;
import com.ecomerce.repository.ProductRepository;
import com.ecomerce.repository.UserProductEventRepository;
import com.ecomerce.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserActivityService {

    private final UserProductEventRepository eventRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final CoOccurrenceService coOccurrenceService;

    @Value("${app.activity.duplicate-window-minutes:10}")
    private int duplicateWindowMinutes = 10;

    @Transactional
    public void recordEvent(Long userId, Long productId, UserProductEvent.EventType eventType, String sessionId) {
        if (productId == null || eventType == null) return;

        OffsetDateTime windowStart = OffsetDateTime.now().minusMinutes(duplicateWindowMinutes);

        // Deduplicate rapid repeat events (e.g. repeated page refreshes or clicks)
        if (eventType == UserProductEvent.EventType.VIEW || eventType == UserProductEvent.EventType.SEARCH_CLICK) {
            boolean duplicate = eventRepository.existsRecentDuplicate(userId, sessionId, productId, eventType, windowStart);
            if (duplicate) {
                return;
            }
        }

        Product product = productRepository.findById(productId).orElse(null);
        if (product == null) return;

        User user = userId != null ? userRepository.findById(userId).orElse(null) : null;

        UserProductEvent event = UserProductEvent.builder()
                .user(user)
                .product(product)
                .eventType(eventType)
                .eventWeight(eventType.getDefaultWeight())
                .sessionId(sessionId)
                .build();

        eventRepository.save(event);
    }

    @Transactional
    public void recordOrderPlaced(Order order) {
        if (order == null || order.getOrderItems() == null || order.getOrderItems().isEmpty()) {
            return;
        }

        User user = order.getUser();
        Set<Long> productIds = new HashSet<>();

        for (OrderItem item : order.getOrderItems()) {
            if (item.getProduct() != null) {
                Long pId = item.getProduct().getId();
                productIds.add(pId);

                // Record PURCHASE event (weight 10)
                UserProductEvent event = UserProductEvent.builder()
                        .user(user)
                        .product(item.getProduct())
                        .eventType(UserProductEvent.EventType.PURCHASE)
                        .eventWeight(UserProductEvent.EventType.PURCHASE.getDefaultWeight())
                        .build();
                eventRepository.save(event);
            }
        }

        // Increment co-occurrence for all pairs in this order
        coOccurrenceService.recordCoPurchases(productIds);
    }
}
