package com.ecomerce.repository;

import com.ecomerce.entity.ProcessedMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ProcessedMessageRepository extends JpaRepository<ProcessedMessage, UUID> {

    /**
     * Durable consumer deduplication. Returns 1 the first time an event ID is recorded and
     * 0 for a duplicate delivery. Run in the same transaction as the consumer's side effect,
     * so "recorded as processed" and "side effect done" commit or roll back together.
     */
    @Modifying
    @Query(nativeQuery = true, value = """
            INSERT INTO processed_messages (event_id, processed_at) VALUES (:eventId, now())
            ON CONFLICT (event_id) DO NOTHING
            """)
    int markProcessed(@Param("eventId") UUID eventId);
}
