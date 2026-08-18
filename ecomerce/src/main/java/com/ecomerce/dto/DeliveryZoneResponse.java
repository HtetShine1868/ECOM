package com.ecomerce.dto;

import com.ecomerce.entity.DeliveryZone;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
public class DeliveryZoneResponse {
    private Long id;
    private String townName;
    private BigDecimal fee;
    private Boolean isActive;
    private LocalDateTime createdAt;

    public static DeliveryZoneResponse from(DeliveryZone zone) {
        return DeliveryZoneResponse.builder()
                .id(zone.getId())
                .townName(zone.getTownName())
                .fee(zone.getFee())
                .isActive(zone.getIsActive())
                .createdAt(zone.getCreatedAt())
                .build();
    }
}
