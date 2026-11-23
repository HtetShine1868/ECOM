package com.ecomerce.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Records event IDs that have been successfully processed by a consumer.
 * Used for consumer-side idempotency — prevents reprocessing duplicate deliveries.
 */
@Entity
@Table(name = "processed_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProcessedMessage {

    @Id
    private UUID eventId;

    @Column(nullable = false)
    @Builder.Default
    private OffsetDateTime processedAt = OffsetDateTime.now();
}
