package com.ecomerce.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ProductRequest {

    @NotBlank(message = "Product name is required")
    @Size(max = 200, message = "Product name must be 200 characters or less")
    private String name;

    @Size(max = 5000, message = "Description must be 5000 characters or less")
    private String description;

    @NotNull(message = "Price is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Price must be greater than 0")
    private BigDecimal price;

    @NotNull(message = "Stock is required")
    @Min(value = 0, message = "Stock cannot be negative")
    private Integer stock;

    @NotNull(message = "Cargo price is required")
    @DecimalMin(value = "0.0", message = "Cargo price cannot be negative")
    private BigDecimal cargoPrice;

    /** Optional — ID of a predefined category */
    private Long categoryId;
}
