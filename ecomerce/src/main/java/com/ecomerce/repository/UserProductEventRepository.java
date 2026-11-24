package com.ecomerce.repository;

import com.ecomerce.entity.UserProductEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

@Repository
public interface UserProductEventRepository extends JpaRepository<UserProductEvent, Long> {

    @Query("SELECT e FROM UserProductEvent e WHERE e.user.id = :userId ORDER BY e.createdAt DESC")
    List<UserProductEvent> findRecentByUser(@Param("userId") Long userId, Pageable pageable);

    @Query("SELECT e FROM UserProductEvent e WHERE e.sessionId = :sessionId ORDER BY e.createdAt DESC")
    List<UserProductEvent> findRecentBySession(@Param("sessionId") String sessionId, Pageable pageable);

    @Query("SELECT COUNT(e) > 0 FROM UserProductEvent e WHERE e.product.id = :productId AND e.eventType = :eventType " +
           "AND ((:userId IS NOT NULL AND e.user.id = :userId) OR (:sessionId IS NOT NULL AND e.sessionId = :sessionId)) " +
           "AND e.createdAt >= :since")
    boolean existsRecentDuplicate(@Param("userId") Long userId,
                                  @Param("sessionId") String sessionId,
                                  @Param("productId") Long productId,
                                  @Param("eventType") UserProductEvent.EventType eventType,
                                  @Param("since") OffsetDateTime since);

    @Query("SELECT e.product.id, SUM(e.eventWeight) FROM UserProductEvent e " +
           "WHERE e.createdAt >= :since GROUP BY e.product.id ORDER BY SUM(e.eventWeight) DESC")
    List<Object[]> findPopularProductScores(@Param("since") OffsetDateTime since, Pageable pageable);

    @Query("SELECT e FROM UserProductEvent e JOIN FETCH e.product p LEFT JOIN FETCH p.category " +
           "WHERE e.user.id = :userId AND e.createdAt >= :since ORDER BY e.createdAt DESC")
    List<UserProductEvent> findByUserSince(@Param("userId") Long userId, @Param("since") OffsetDateTime since, Pageable pageable);
}
