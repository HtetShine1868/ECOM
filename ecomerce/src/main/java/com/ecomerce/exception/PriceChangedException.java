package com.ecomerce.exception;

import com.ecomerce.dto.ProductResponse;
import lombok.Getter;

import java.math.BigDecimal;
import java.util.List;

/**
 * 409 PRICE_CHANGED: one or more items cost something different from what the customer
 * last reviewed. Nothing was charged and no stock was changed; the customer must confirm.
 */
@Getter
public class PriceChangedException extends RuntimeException {

    /** One changed line. Safe, public product data only. */
    public record PriceChange(Long productId, String productName,
                              BigDecimal previousPrice, BigDecimal currentPrice,
                              BigDecimal previousCargoPrice, BigDecimal currentCargoPrice) {
    }

    private final transient List<ProductResponse> updatedProducts;
    private final transient List<PriceChange> changes;

    public PriceChangedException(List<ProductResponse> updatedProducts, List<PriceChange> changes) {
        super("Some prices changed since you last looked. Please review the new prices and confirm.");
        this.updatedProducts = updatedProducts;
        this.changes = changes;
    }

    public PriceChangedException(List<ProductResponse> updatedProducts) {
        this(updatedProducts, List.of());
    }
}
