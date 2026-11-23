package com.ecomerce.exception;

import lombok.Getter;

/**
 * 409 PRODUCT_MODIFIED_BY_ANOTHER_USER: the admin submitted a product version that is no
 * longer current (another admin saved, or a customer purchase changed the stock).
 * {@code current} carries the latest product so the UI can show what changed.
 */
@Getter
public class OptimisticLockConflictException extends RuntimeException {

    private final transient Object current;

    public OptimisticLockConflictException(String message) {
        this(message, null);
    }

    public OptimisticLockConflictException(String message, Object current) {
        super(message);
        this.current = current;
    }
}
