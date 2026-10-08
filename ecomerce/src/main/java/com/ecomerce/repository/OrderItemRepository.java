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
     * Excludes orphaned items (product IS NOT NULL).
     */
    @Query("""
            SELECT oi.product.id, SUM(oi.quantity) as totalSold
            FROM OrderItem oi
            WHERE oi.product IS NOT NULL
            AND oi.order.status <> com.ecomerce.entity.Order.OrderStatus.CANCELLED
            GROUP BY oi.product.id
            ORDER BY CASE WHEN MAX(oi.product.stock) > 0 THEN 1 ELSE 0 END DESC, totalSold DESC
            """)
    List<Object[]> findTopSellingProductIds(Pageable pageable);

    /**
     * Returns [productId, totalSold] pairs ordered by totalSold DESC for a specific category.
     */
    @Query("""
            SELECT oi.product.id, SUM(oi.quantity) as totalSold
            FROM OrderItem oi
            WHERE oi.product IS NOT NULL
            AND oi.order.status <> com.ecomerce.entity.Order.OrderStatus.CANCELLED
            AND oi.product.category.id = :categoryId
            GROUP BY oi.product.id
            ORDER BY CASE WHEN MAX(oi.product.stock) > 0 THEN 1 ELSE 0 END DESC, totalSold DESC
            """)
    List<Object[]> findTopSellingProductIdsByCategory(@Param("categoryId") Long categoryId, Pageable pageable);
}
