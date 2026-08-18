package com.ecomerce.service;

import com.ecomerce.dto.DeliveryZoneRequest;
import com.ecomerce.dto.DeliveryZoneResponse;
import com.ecomerce.entity.DeliveryZone;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.DeliveryZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DeliveryZoneService {

    private final DeliveryZoneRepository deliveryZoneRepository;

    /** All zones (admin view) */
    public List<DeliveryZoneResponse> getAllZones() {
        return deliveryZoneRepository.findAll().stream()
                .map(DeliveryZoneResponse::from)
                .collect(Collectors.toList());
    }

    /** Active zones only (user-facing dropdown) */
    public List<DeliveryZoneResponse> getActiveZones() {
        return deliveryZoneRepository.findAllByIsActiveTrue().stream()
                .map(DeliveryZoneResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public DeliveryZoneResponse createZone(DeliveryZoneRequest request) {
        if (deliveryZoneRepository.existsByTownNameIgnoreCase(request.getTownName())) {
            throw new IllegalArgumentException("Delivery zone already exists: " + request.getTownName());
        }
        DeliveryZone zone = DeliveryZone.builder()
                .townName(request.getTownName().trim())
                .fee(request.getFee())
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .build();
        return DeliveryZoneResponse.from(deliveryZoneRepository.save(zone));
    }

    @Transactional
    public DeliveryZoneResponse updateZone(Long id, DeliveryZoneRequest request) {
        DeliveryZone zone = deliveryZoneRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery zone not found: " + id));

        boolean nameConflict = deliveryZoneRepository.existsByTownNameIgnoreCase(request.getTownName())
                && !zone.getTownName().equalsIgnoreCase(request.getTownName());
        if (nameConflict) {
            throw new IllegalArgumentException("Town name already taken: " + request.getTownName());
        }

        zone.setTownName(request.getTownName().trim());
        zone.setFee(request.getFee());
        if (request.getIsActive() != null) {
            zone.setIsActive(request.getIsActive());
        }
        return DeliveryZoneResponse.from(deliveryZoneRepository.save(zone));
    }

    @Transactional
    public void deleteZone(Long id) {
        DeliveryZone zone = deliveryZoneRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery zone not found: " + id));
        deliveryZoneRepository.delete(zone);
    }

    /**
     * Resolves the delivery fee for a given zone ID.
     * Returns the zone's fee and townName; throws if not found or inactive.
     */
    public DeliveryZone resolveZone(Long zoneId) {
        DeliveryZone zone = deliveryZoneRepository.findById(zoneId)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery zone not found: " + zoneId));
        if (!zone.getIsActive()) {
            throw new IllegalArgumentException("Delivery zone is not active: " + zone.getTownName());
        }
        return zone;
    }
}
