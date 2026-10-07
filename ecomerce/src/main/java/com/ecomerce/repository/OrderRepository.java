package com.ecomerce.repository;

import com.ecomerce.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    @Query("SELECT o FROM Order o JOIN FETCH o.user ORDER BY o.orderDate DESC")
    List<Order> findAllWithUser();

    List<Order> findByUserIdOrderByOrderDateDesc(Long userId);
    Optional<Order> findByIdAndUserId(Long id, Long userId);
    Optional<Order> findByIdempotencyKey(String idempotencyKey);
}
