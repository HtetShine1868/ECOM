package com.ecomerce.repository;

import com.ecomerce.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

    // Search by name only
    Page<Product> findByNameContainingIgnoreCase(String name, Pageable pageable);

    // Filter by category only
    Page<Product> findByCategoryId(Long categoryId, Pageable pageable);

    // Search by name AND category
    Page<Product> findByNameContainingIgnoreCaseAndCategoryId(String name, Long categoryId, Pageable pageable);

    /**
     * Atomic conditional stock decrement — the stock-safety mechanism for checkout.
     *
     * Returns 1 if the row was updated (product exists, is active, has enough stock),
     * 0 otherwise; the caller then rolls back the whole order. PostgreSQL serialises
     * concurrent updates of the same row, and the WHERE clause is re-checked against the
     * committed value, so two buyers can never both take the last unit.
     *
     * The version is bumped as well, so an admin form that was opened before this purchase
     * cannot later save an old stock number over it (it gets an optimistic-lock conflict).
     *
     * Callers lock rows in ascending product-ID order to avoid deadlocks.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
        UPDATE products
        SET stock = stock - :quantity,
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :productId
          AND active = TRUE
          AND stock >= :quantity
        """, nativeQuery = true)
    int decrementStock(@Param("productId") Long productId, @Param("quantity") int quantity);

    /**
     * Fresh stock/active read that bypasses the persistence context. Used only to explain
     * a failed decrement to the customer, never as the safety check.
     */
    @Query(value = "SELECT id, stock, active FROM products WHERE id = :productId", nativeQuery = true)
    List<Object[]> findStockSnapshot(@Param("productId") Long productId);
}
