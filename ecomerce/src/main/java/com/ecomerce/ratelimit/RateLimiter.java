package com.ecomerce.ratelimit;

import com.ecomerce.common.infra.RedisAvailability;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fixed-window rate limiter.
 *
 * <b>Shared</b>: counters live in Redis (one atomic Lua INCR + EXPIRE), so every backend
 * instance enforces the same limit.
 * <b>Redis down or disabled</b>: falls back to an in-memory counter per instance. Limits stay
 * on (abuse protection is not silently disabled), traffic is never blocked because Redis is
 * down, and the effective limit becomes "per instance".
 */
@Component
@Slf4j
public class RateLimiter {

    public record Decision(boolean allowed, long remaining, long retryAfterSeconds) {
    }

    /** KEYS[1]=counter; ARGV[1]=window seconds. Returns {count, ttl}. */
    private static final DefaultRedisScript<List> SCRIPT = new DefaultRedisScript<>("""
            local c = redis.call('INCR', KEYS[1])
            if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
            local ttl = redis.call('TTL', KEYS[1])
            if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
            return {c, ttl}
            """, List.class);

    private static final int MAX_LOCAL_KEYS = 50_000;

    private final StringRedisTemplate redis;
    private final RedisAvailability redisAvailability;
    private final Clock clock;
    private final Map<String, long[]> local = new ConcurrentHashMap<>(); // key -> {windowStartMs, count}

    @org.springframework.beans.factory.annotation.Autowired
    public RateLimiter(StringRedisTemplate redis, RedisAvailability redisAvailability) {
        this(redis, redisAvailability, Clock.systemUTC());
    }

    RateLimiter(StringRedisTemplate redis, RedisAvailability redisAvailability, Clock clock) {
        this.redis = redis;
        this.redisAvailability = redisAvailability;
        this.clock = clock;
    }

    public Decision acquire(RateLimitPolicies.Policy policy, String identity) {
        String key = "ratelimit:" + policy.name() + ":" + identity;
        Optional<Decision> shared = redisAvailability.call("rate-limit", () -> acquireRedis(key, policy));
        return shared.orElseGet(() -> acquireLocal(key, policy));
    }

    @SuppressWarnings("unchecked")
    private Decision acquireRedis(String key, RateLimitPolicies.Policy policy) {
        List<Long> result = redis.execute(SCRIPT, List.of(key), String.valueOf(policy.windowSeconds()));
        if (result == null || result.size() < 2) {
            throw new IllegalStateException("Unexpected rate-limit script result");
        }
        long count = result.get(0);
        long ttl = Math.max(1, result.get(1));
        return decide(count, policy.maxRequests(), ttl);
    }

    Decision acquireLocal(String key, RateLimitPolicies.Policy policy) {
        long now = clock.millis();
        long windowMs = policy.windowSeconds() * 1000L;
        if (local.size() > MAX_LOCAL_KEYS) {
            evictExpired();
        }
        long[] state = local.compute(key, (k, s) -> {
            if (s == null || now - s[0] >= windowMs) {
                return new long[]{now, 1};
            }
            s[1]++;
            return s;
        });
        long retryAfter = Math.max(1, (state[0] + windowMs - now + 999) / 1000);
        return decide(state[1], policy.maxRequests(), retryAfter);
    }

    private static Decision decide(long count, int max, long retryAfterSeconds) {
        boolean allowed = count <= max;
        return new Decision(allowed, Math.max(0, max - count), allowed ? 0 : retryAfterSeconds);
    }

    /** Bound memory: drop windows that ended more than an hour ago. */
    @Scheduled(fixedDelay = 300_000)
    public void evictExpired() {
        long cutoff = clock.millis() - 3_600_000L;
        local.entrySet().removeIf(e -> e.getValue()[0] < cutoff);
    }

    /** Hash identities so Redis keys never contain emails or raw IPs. */
    public static String hashIdentity(String raw) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 12);
        } catch (Exception e) {
            return Integer.toHexString(raw.hashCode());
        }
    }
}
