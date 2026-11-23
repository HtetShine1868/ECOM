package com.ecomerce.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Transactional outbox record.
 * Written in the same DB transaction as the business operation (e.g. order creation).
 * A background poller reads unpublished events and processes them in-process.
 */
@Entity
@Table(name = "outbox_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OutboxEvent {

    /** Equals the event's eventId, so consumers can deduplicate on it. Assigned, not generated. */
    @Id
    @Builder.Default
    private UUID id = UUID.randomUUID();

    @Column(nullable = false, length = 50)
    private String aggregateType;

    @Column(nullable = false, length = 50)
    private String aggregateId;

    @Column(nullable = false, length = 80)
    private String eventType;

    @Column(nullable = false)
    @Builder.Default
    private int eventVersion = 1;

    @Column(nullable = false, columnDefinition = "JSONB")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private String payload;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column
    private OffsetDateTime publishedAt;

    @Column(nullable = false)
    @Builder.Default
    private int attemptCount = 0;

    /** Earliest time of the next publish attempt (exponential backoff). Null = now. */
    @Column(name = "next_attempt_at")
    private OffsetDateTime nextAttemptAt;

    /** Short, sanitised error class/message of the last failed attempt. */
    @Column(columnDefinition = "TEXT")
    private String lastError;
}
