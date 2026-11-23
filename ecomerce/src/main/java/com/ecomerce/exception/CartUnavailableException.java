package com.ecomerce.exception;

/** The cart store (Redis) is temporarily unreachable. Mapped to 503 CART_UNAVAILABLE. */
public class CartUnavailableException extends RuntimeException {
    public CartUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
