package com.ecomerce.repository;

import com.ecomerce.entity.ProductCoOccurrence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProductCoOccurrenceRepository extends JpaRepository<ProductCoOccurrence, ProductCoOccurrence.CoOccurrenceId> {

    @Query("SELECT c FROM ProductCoOccurrence c WHERE (c.productAId = :productId OR c.productBId = :productId) ORDER BY c.coPurchaseCount DESC")
    List<ProductCoOccurrence> findTopCoPurchased(@Param("productId") Long productId);

    @Modifying
    @Query(value = "INSERT INTO product_co_occurrences (product_a_id, product_b_id, co_purchase_count, updated_at) " +
                   "VALUES (:pA, :pB, 1, CURRENT_TIMESTAMP) " +
                   "ON CONFLICT (product_a_id, product_b_id) " +
                   "DO UPDATE SET co_purchase_count = product_co_occurrences.co_purchase_count + 1, updated_at = CURRENT_TIMESTAMP",
           nativeQuery = true)
    void incrementCoOccurrence(@Param("pA") Long productAId, @Param("pB") Long productBId);
}
