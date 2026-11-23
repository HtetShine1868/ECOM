package com.ecomerce.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * Cart as shown to the customer. Every price and availability value here is read from
 * PostgreSQL at response time; the cart store only holds product IDs and quantities.
 * Totals are a preview: checkout recalculates everything on the server.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CartResponse {
    private Long cartId;
    private List<CartItemResponse> items;
    private int totalItems;
    private BigDecimal subtotal;
    private BigDecimal cargoTotal;
    private BigDecimal total;
    /** "REDIS" or "POSTGRES" — where the cart lines are stored. */
    private String storage;
    /** True when at least one line changed price since the customer last reviewed it. */
    private boolean hasPriceChanges;
    /** True when at least one line cannot be bought as-is (inactive, removed, not enough stock). */
    private boolean hasUnavailableItems;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CartItemResponse {
        /** Kept for older clients; equals productId. */
        private Long cartItemId;
        private Long productId;
        private String productName;
        private String productImageUrl;
        private BigDecimal unitPrice;
        private BigDecimal cargoPrice;
        private Integer quantity;
        private BigDecimal lineTotal;
        /** Current stock, for display. Not a reservation. */
        private Integer availableStock;
        /** True when the product is active AND has enough stock for the requested quantity. */
        private Boolean available;
        /** False when the product was deactivated or deleted. */
        private Boolean active;
        /** IN_STOCK, INSUFFICIENT_STOCK, OUT_OF_STOCK, INACTIVE or REMOVED. */
        private String availability;
        /** True when unitPrice differs from the price the customer last reviewed. */
        private Boolean priceChanged;
        /** The price the customer last reviewed (null if never recorded). */
        private BigDecimal previousPrice;
    }
}
