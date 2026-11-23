package com.ecomerce.repository;

import com.ecomerce.entity.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    /**
     * Claim a batch of due, unpublished events. FOR UPDATE SKIP LOCKED lets several backend
     * instances poll at once: each row is handled by exactly one of them, and a slow or
     * failing event never blocks the others. Rows over the attempt limit are left in place
     * (visible on the admin status page) instead of being marked published.
     */
    @Query(nativeQuery = true, value = """
            SELECT * FROM outbox_events
            WHERE published_at IS NULL
              AND attempt_count < :maxAttempts
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
            ORDER BY created_at
            LIMIT :batchSize
            FOR UPDATE SKIP LOCKED
            """)
    List<OutboxEvent> claimDue(@Param("maxAttempts") int maxAttempts, @Param("batchSize") int batchSize);

    @Query("SELECT COUNT(e) FROM OutboxEvent e WHERE e.publishedAt IS NULL AND e.attemptCount < :maxAttempts")
    long countPending(@Param("maxAttempts") int maxAttempts);

    @Query("SELECT COUNT(e) FROM OutboxEvent e WHERE e.publishedAt IS NULL AND e.attemptCount >= :maxAttempts")
    long countExhausted(@Param("maxAttempts") int maxAttempts);

    List<OutboxEvent> findByAggregateTypeAndAggregateId(String aggregateType, String aggregateId);

    /** Operator action: give exhausted events a fresh set of attempts. */
    @Modifying
    @Query(nativeQuery = true, value = """
            UPDATE outbox_events SET attempt_count = 0, next_attempt_at = NULL
            WHERE published_at IS NULL AND attempt_count >= :maxAttempts
            """)
    int resetExhausted(@Param("maxAttempts") int maxAttempts);
}
