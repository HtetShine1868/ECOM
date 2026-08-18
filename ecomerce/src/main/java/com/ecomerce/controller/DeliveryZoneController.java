package com.ecomerce.controller;

import com.ecomerce.dto.DeliveryZoneRequest;
import com.ecomerce.dto.DeliveryZoneResponse;
import com.ecomerce.service.DeliveryZoneService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class DeliveryZoneController {

    private final DeliveryZoneService deliveryZoneService;

    // ----- Public endpoint — for user's town dropdown -----

    @GetMapping("/api/delivery-zones")
    public ResponseEntity<List<DeliveryZoneResponse>> getActiveZones() {
        return ResponseEntity.ok(deliveryZoneService.getActiveZones());
    }

    // ----- Admin-only endpoints -----

    @GetMapping("/api/admin/delivery-zones")
    public ResponseEntity<List<DeliveryZoneResponse>> getAllZones() {
        return ResponseEntity.ok(deliveryZoneService.getAllZones());
    }

    @PostMapping("/api/admin/delivery-zones")
    public ResponseEntity<DeliveryZoneResponse> createZone(@Valid @RequestBody DeliveryZoneRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(deliveryZoneService.createZone(request));
    }

    @PutMapping("/api/admin/delivery-zones/{id}")
    public ResponseEntity<DeliveryZoneResponse> updateZone(@PathVariable Long id,
                                                            @Valid @RequestBody DeliveryZoneRequest request) {
        return ResponseEntity.ok(deliveryZoneService.updateZone(id, request));
    }

    @DeleteMapping("/api/admin/delivery-zones/{id}")
    public ResponseEntity<Void> deleteZone(@PathVariable Long id) {
        deliveryZoneService.deleteZone(id);
        return ResponseEntity.noContent().build();
    }
}
