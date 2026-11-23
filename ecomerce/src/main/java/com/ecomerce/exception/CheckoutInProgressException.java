package com.ecomerce.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class CheckoutInProgressException extends RuntimeException {

    public CheckoutInProgressException(String message) {
        super(message);
    }
}
