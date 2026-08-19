package com.ecomerce.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class OrderRequest {

    @NotBlank(message = "Customer name is required")
    private String customerName;

    private String customerPhone;

    /**
     * ID of a predefined DeliveryZone (township) selected from the dropdown.
     */
    @NotNull(message = "Delivery zone (township) is required")
    private Long deliveryZoneId;

    /**
     * Specific street/block/detail location written by the user.
     */
    @NotBlank(message = "Specific delivery address is required")
    private String customDeliveryAddress;
}
