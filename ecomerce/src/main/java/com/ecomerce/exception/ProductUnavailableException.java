package com.ecomerce.exception;

import lombok.Getter;

/**
 * Thrown when a product in the order is inactive/deactivated and cannot be purchased.
 */
@Getter
public class ProductUnavailableException extends RuntimeException {

    private final Long productId;
    private final String productName;

    public ProductUnavailableException(Long productId, String productName) {
        super("Product is no longer available: " + productName);
        this.productId = productId;
        this.productName = productName;
    }
}
