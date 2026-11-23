package com.ecomerce.messaging.event;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * ORDER_CREATED, version 1.
 *
 * Carries IDs only: no names, phone numbers, addresses, or payment data. Consumers load the
 * authoritative order from PostgreSQL. New optional fields may be added in version 1;
 * removing or changing a field requires a new eventVersion.
 */
public record OrderCreatedEvent(
        UUID eventId,
        String eventType,
        int eventVersion,
        OffsetDateTime occurredAt,
        Long orderId,
        Long userId,
        String correlationId) {

    public static final String TYPE = "ORDER_CREATED";
    public static final int VERSION = 1;

    public static OrderCreatedEvent of(UUID eventId, Long orderId, Long userId,
                                       OffsetDateTime occurredAt, String correlationId) {
        return new OrderCreatedEvent(eventId, TYPE, VERSION, occurredAt, orderId, userId, correlationId);
    }
}
