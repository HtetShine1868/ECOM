package com.ecomerce.exception;

/** 403 EMAIL_NOT_VERIFIED: the action needs a verified email address. */
public class EmailNotVerifiedException extends RuntimeException {
    public EmailNotVerifiedException() {
        super("Please verify your email address first. We sent you a link when you signed up.");
    }
}
