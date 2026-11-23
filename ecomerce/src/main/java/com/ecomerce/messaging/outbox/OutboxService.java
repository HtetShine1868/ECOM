package com.ecomerce.messaging.outbox;

import com.ecomerce.entity.OutboxEvent;
import com.ecomerce.messaging.event.OrderCreatedEvent;
import com.ecomerce.repository.OutboxEventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes events to the outbox table. MANDATORY propagation: an event can only be recorded
 * inside the business transaction that produced it, so the event exists if and only if the
 * order exists. Processing happens later, in {@link OutboxPublisher}.
 */
@Service
@RequiredArgsConstructor
public class OutboxService {

    private final OutboxEventRepository repository;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public OutboxEvent recordOrderCreated(OrderCreatedEvent event) {
        return repository.save(OutboxEvent.builder()
                .id(event.eventId())
                .aggregateType("ORDER")
                .aggregateId(String.valueOf(event.orderId()))
                .eventType(event.eventType())
                .eventVersion(event.eventVersion())
                .payload(toJson(event))
                .build());
    }

    String toJson(Object event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Event could not be serialised", e);
        }
    }
}
