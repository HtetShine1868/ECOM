package com.ecomerce.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class DeliveryZoneRequest {

    @NotBlank(message = "Town name is required")
    @Size(max = 120, message = "Town name must be 120 characters or less")
    private String townName;

    @NotNull(message = "Delivery fee is required")
    @DecimalMin(value = "0.0", message = "Delivery fee cannot be negative")
    private BigDecimal fee;

    private Boolean isActive = true;
}
