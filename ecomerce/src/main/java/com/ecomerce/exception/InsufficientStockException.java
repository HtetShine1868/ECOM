package com.ecomerce.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
@Getter
public class InsufficientStockException extends RuntimeException {

    private final Long productId;
    private final String productNameValue;
    private final int requestedQuantity;
    private final int availableStock;

    public InsufficientStockException(Long productId, String productName, int requested, int available) {
        super(available <= 0
                ? "This product is currently out of stock: " + productName
                : "Only " + available + " units of " + productName + " are available, but " + requested + " were requested.");
        this.productId = productId;
        this.productNameValue = productName;
        this.requestedQuantity = requested;
        this.availableStock = available;
    }

    /** Legacy constructor — when product ID is unknown */
    public InsufficientStockException(String productName, int requested, int available) {
        this(null, productName, requested, available);
    }
}
