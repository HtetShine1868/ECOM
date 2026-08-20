package com.ecomerce.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

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

    /**
     * Cart items sent from the client (frontend manages cart in localStorage).
     */
    @NotEmpty(message = "Order must contain at least one item")
    private List<OrderItemRequest> items;

    @Data
    public static class OrderItemRequest {
        @NotNull(message = "Product ID is required")
        private Long productId;

        @NotNull(message = "Quantity is required")
        @Min(value = 1, message = "Quantity must be at least 1")
        private Integer quantity;
    }
}
