package com.ecomerce.repository;

import com.ecomerce.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

    // Search by name only
    Page<Product> findByNameContainingIgnoreCase(String name, Pageable pageable);

    // Filter by category only
    Page<Product> findByCategoryId(Long categoryId, Pageable pageable);

    // Search by name AND category
    Page<Product> findByNameContainingIgnoreCaseAndCategoryId(String name, Long categoryId, Pageable pageable);
}
