package com.ecomerce.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.BAD_REQUEST)
public class InsufficientStockException extends RuntimeException {
    public InsufficientStockException(String productName, int requested, int available) {
        super(available <= 0
                ? "This product is currently out of stock."
                : "Only " + available + " units of " + productName + " are available.");
    }
}
