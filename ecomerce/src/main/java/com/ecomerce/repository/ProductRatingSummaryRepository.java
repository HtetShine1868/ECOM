package com.ecomerce.repository;

import com.ecomerce.entity.ProductRatingSummary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProductRatingSummaryRepository extends JpaRepository<ProductRatingSummary, Long> {
}
