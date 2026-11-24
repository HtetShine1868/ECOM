package com.ecomerce.exception;

/** 403 ACCOUNT_SUSPENDED. */
public class AccountSuspendedException extends RuntimeException {
    public AccountSuspendedException() {
        super("Your account is suspended. Please contact the shop.");
    }
}
