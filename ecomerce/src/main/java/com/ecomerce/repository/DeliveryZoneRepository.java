package com.ecomerce.repository;

import com.ecomerce.entity.DeliveryZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DeliveryZoneRepository extends JpaRepository<DeliveryZone, Long> {
    List<DeliveryZone> findAllByIsActiveTrue();
    Optional<DeliveryZone> findByTownNameIgnoreCase(String townName);
    boolean existsByTownNameIgnoreCase(String townName);
}
