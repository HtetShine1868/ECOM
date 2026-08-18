package com.ecomerce.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OrderRequest {

    @NotBlank(message = "Customer name is required")
    private String customerName;

    private String customerPhone;

    /**
     * ID of a predefined DeliveryZone selected from the dropdown.
     * If provided, the zone's fee is auto-applied and townName is captured.
     * At least one of deliveryZoneId or customDeliveryAddress must be supplied.
     */
    private Long deliveryZoneId;

    /**
     * Free-text address for locations not in the predefined zone list.
     * Used when deliveryZoneId is null. Delivery fee will be 0.
     */
    private String customDeliveryAddress;
}
