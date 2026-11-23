package com.ecomerce.exception;

import lombok.Getter;

/** 404. {@code code} is PRODUCT_NOT_FOUND for products and NOT_FOUND otherwise. */
@Getter
public class ResourceNotFoundException extends RuntimeException {

    private final String code;

    public ResourceNotFoundException(String message) {
        this("NOT_FOUND", message);
    }

    public ResourceNotFoundException(String code, String message) {
        super(message);
        this.code = code;
    }

    public static ResourceNotFoundException product(Long productId) {
        return new ResourceNotFoundException("PRODUCT_NOT_FOUND", "Product not found: " + productId);
    }
}
