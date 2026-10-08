package com.ecomerce.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class OrderRequest {

    @NotBlank(message = "Customer name is required")
    @Size(max = 120, message = "Name must be 120 characters or less")
    private String customerName;

    @NotBlank(message = "Phone number is required")
    @Pattern(
            regexp = "^\\+95[1-9]\\d{6,10}$",
            message = "Phone must be a Myanmar number like +959123456789 (digits only after +95)"
    )
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
    @Size(max = 500, message = "Address must be 500 characters or less")
    private String customDeliveryAddress;

    /**
     * Cart items sent from the client (frontend manages cart in localStorage).
     */
    @NotEmpty(message = "Order must contain at least one item")
    private List<OrderItemRequest> items;

    /** Optional key that makes a repeated checkout return the original order. */
    @Size(max = 80, message = "Idempotency key is too long")
    @Pattern(regexp = "^[A-Za-z0-9-]*$", message = "Idempotency key contains invalid characters")
    private String idempotencyKey;

    @Data
    public static class OrderItemRequest {
        @NotNull(message = "Product ID is required")
        private Long productId;

        @NotNull(message = "Quantity is required")
        @Min(value = 1, message = "Quantity must be at least 1")
        private Integer quantity;
    }
}
