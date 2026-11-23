package com.ecomerce.exception;

import lombok.Getter;

/** 429 RATE_LIMITED, with the number of seconds until the window resets. */
@Getter
public class RateLimitedException extends RuntimeException {

    private final long retryAfterSeconds;

    public RateLimitedException(long retryAfterSeconds) {
        super("Too many requests. Please try again in " + retryAfterSeconds + " seconds.");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
