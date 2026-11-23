package com.ecomerce.common.infra;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * Single gate for every Redis call.
 *
 * <ul>
 *   <li>If Redis is not enabled, callers get {@link Optional#empty()} immediately.</li>
 *   <li>After a Redis error the circuit opens for {@code app.redis.circuit-open-seconds};
 *       during that time Redis is skipped instead of making each request wait for a timeout.</li>
 * </ul>
 *
 * Redis is never an authority for stock, prices or orders, so skipping it is always safe:
 * callers fall back to PostgreSQL (cache) or a local limiter (rate limiting).
 */
@Component
@Slf4j
public class RedisAvailability {

    private final boolean enabled;
    private final long openMillis;
    private final Clock clock;
    private final AtomicLong openUntil = new AtomicLong(0);
    private final AtomicLong failures = new AtomicLong(0);
    private volatile String lastError;

    @org.springframework.beans.factory.annotation.Autowired
    public RedisAvailability(Environment env,
                             @Value("${app.redis.circuit-open-seconds:30}") long openSeconds) {
        this(InfraToggles.redisEnabled(env), openSeconds, Clock.systemUTC());
    }

    RedisAvailability(boolean enabled, long openSeconds, Clock clock) {
        this.enabled = enabled;
        this.openMillis = Math.max(1, openSeconds) * 1000L;
        this.clock = clock;
        if (!enabled) {
            log.info("Redis is disabled (set REDIS_URL or REDIS_ENABLED=true to enable). "
                    + "Cache is bypassed, carts use PostgreSQL, rate limits are per instance.");
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** True when Redis is enabled and the circuit is closed. */
    public boolean isUsable() {
        return enabled && clock.millis() >= openUntil.get();
    }

    /**
     * Run a Redis operation. Returns empty when Redis is disabled, the circuit is open,
     * or the call fails (which opens the circuit).
     */
    public <T> Optional<T> call(String operation, Supplier<T> action) {
        if (!isUsable()) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(action.get());
        } catch (RuntimeException e) {
            recordFailure(operation, e);
            return Optional.empty();
        }
    }

    /** Like {@link #call} but reports success, for fire-and-forget writes. */
    public boolean run(String operation, Runnable action) {
        return call(operation, () -> {
            action.run();
            return Boolean.TRUE;
        }).isPresent();
    }

    public void recordFailure(String operation, Throwable e) {
        failures.incrementAndGet();
        lastError = e.getClass().getSimpleName();
        long until = clock.millis() + openMillis;
        openUntil.set(until);
        log.warn("Redis {} failed ({}); skipping Redis until {}",
                operation, e.getClass().getSimpleName(), Instant.ofEpochMilli(until));
    }

    public long failureCount() {
        return failures.get();
    }

    public String lastError() {
        return lastError;
    }
}
