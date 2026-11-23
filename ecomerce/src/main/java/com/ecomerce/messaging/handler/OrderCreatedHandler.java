package com.ecomerce.messaging.handler;

import com.ecomerce.entity.Order;
import com.ecomerce.messaging.event.OrderCreatedEvent;
import com.ecomerce.repository.OrderRepository;
import com.ecomerce.repository.ProcessedMessageRepository;
import com.ecomerce.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Side effects of ORDER_CREATED (currently: in-app "new order" notifications for admins).
 *
 * Idempotent: the event ID is recorded in processed_messages in the SAME transaction as the
 * notifications. A duplicate delivery finds the ID already recorded and does nothing; a failure
 * rolls back both, so the retry starts clean. Called by the outbox dispatcher.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderCreatedHandler {

    public enum Outcome { PROCESSED, DUPLICATE, ORDER_MISSING }

    private final ProcessedMessageRepository processedMessages;
    private final OrderRepository orderRepository;
    private final NotificationService notificationService;

    @Transactional
    public Outcome handle(OrderCreatedEvent event) {
        if (event == null || event.eventId() == null || event.orderId() == null) {
            throw new IllegalArgumentException("ORDER_CREATED event is missing eventId or orderId");
        }
        if (event.eventVersion() != OrderCreatedEvent.VERSION) {
            throw new IllegalArgumentException("Unsupported ORDER_CREATED version " + event.eventVersion());
        }
        if (processedMessages.markProcessed(event.eventId()) == 0) {
            log.info("Duplicate event {} for order {} ignored", event.eventId(), event.orderId());
            return Outcome.DUPLICATE;
        }

        // Authoritative data comes from PostgreSQL, not from the message.
        Order order = orderRepository.findById(event.orderId()).orElse(null);
        if (order == null) {
            log.warn("Event {} refers to missing order {}", event.eventId(), event.orderId());
            return Outcome.ORDER_MISSING;
        }
        notificationService.notifyNewOrder(order.getId(), order.getCustomerName(), order.getTotal());
        log.info("Processed event {} for order {}", event.eventId(), order.getId());
        return Outcome.PROCESSED;
    }
}
