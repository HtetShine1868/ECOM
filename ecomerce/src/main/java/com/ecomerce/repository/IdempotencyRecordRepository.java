package com.ecomerce.repository;

import com.ecomerce.entity.IdempotencyRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * Every state change is a single conditional statement, so two concurrent requests can
 * never both "win" the same key. The UNIQUE (user_id, idempotency_key) constraint is the
 * final arbiter for inserts.
 */
public interface IdempotencyRecordRepository extends JpaRepository<IdempotencyRecord, Long> {

    Optional<IdempotencyRecord> findByUserIdAndIdempotencyKey(Long userId, String idempotencyKey);

    /** @return 1 if this request created the record (and so owns the key), 0 if it already existed. */
    @Modifying
    @Query(nativeQuery = true, value = """
            INSERT INTO idempotency_records (user_id, idempotency_key, request_hash, status, created_at, updated_at)
            VALUES (:userId, :key, :hash, 'PROCESSING', now(), now())
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
            """)
    int insertIfAbsent(@Param("userId") Long userId, @Param("key") String key, @Param("hash") String hash);

    /** Take over a key whose previous attempt definitively failed. */
    @Modifying
    @Query(nativeQuery = true, value = """
            UPDATE idempotency_records SET status = 'PROCESSING', updated_at = now()
            WHERE id = :id AND status = 'FAILED'
            """)
    int reclaimFailed(@Param("id") Long id);

    /** Take over a key whose PROCESSING attempt is older than the timeout (crashed request). */
    @Modifying
    @Query(nativeQuery = true, value = """
            UPDATE idempotency_records SET updated_at = now()
            WHERE id = :id AND status = 'PROCESSING'
              AND updated_at < now() - make_interval(secs => :timeoutSeconds)
            """)
    int reclaimStale(@Param("id") Long id, @Param("timeoutSeconds") double timeoutSeconds);

    /** Runs inside the order transaction, so it commits or rolls back together with the order. */
    @Modifying
    @Query(nativeQuery = true, value = """
            UPDATE idempotency_records SET status = 'SUCCEEDED', order_id = :orderId, updated_at = now()
            WHERE user_id = :userId AND idempotency_key = :key AND status = 'PROCESSING'
            """)
    int markSucceeded(@Param("userId") Long userId, @Param("key") String key, @Param("orderId") Long orderId);

    @Modifying
    @Query(nativeQuery = true, value = """
            UPDATE idempotency_records SET status = 'FAILED', updated_at = now()
            WHERE user_id = :userId AND idempotency_key = :key AND status = 'PROCESSING'
            """)
    int markFailed(@Param("userId") Long userId, @Param("key") String key);
}
