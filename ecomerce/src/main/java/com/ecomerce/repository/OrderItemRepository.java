package com.ecomerce.repository;

import com.ecomerce.entity.OrderItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    /**
     * Returns [productId, totalSold] pairs ordered by totalSold DESC.
     * Filters by categoryId if provided; excludes orphaned items (product IS NOT NULL).
     */
    @Query("""
            SELECT oi.product.id, SUM(oi.quantity) as totalSold
            FROM OrderItem oi
            WHERE oi.product IS NOT NULL
            AND (:categoryId IS NULL OR oi.product.category.id = :categoryId)
            GROUP BY oi.product.id
            ORDER BY totalSold DESC
            """)
    List<Object[]> findTopSellingProductIds(
            @Param("categoryId") Long categoryId,
            Pageable pageable
    );
}
