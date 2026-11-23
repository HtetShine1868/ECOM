package com.ecomerce.repository;

import com.ecomerce.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    @Modifying
    @Query(nativeQuery = true, value = "DELETE FROM cart_items WHERE product_id = :productId")
    int deleteAllByProductId(@Param("productId") Long productId);
}
