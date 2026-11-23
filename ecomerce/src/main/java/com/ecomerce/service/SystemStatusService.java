package com.ecomerce.service;

import com.ecomerce.cart.CartService;
import com.ecomerce.common.infra.RedisAvailability;
import com.ecomerce.messaging.outbox.OutboxPublisher;
import com.ecomerce.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Operational status for admins. Checks are short and never throw: an optional dependency
 * being down is reported, not propagated. No hostnames, URLs or credentials are returned.
 */
@Service
@RequiredArgsConstructor
public class SystemStatusService {

    private final RedisAvailability redisAvailability;
    private final StringRedisTemplate redis;
    private final OutboxPublisher outboxPublisher;
    private final OutboxEventRepository outboxRepository;
    private final ProductCacheService cacheService;
    private final CartService cartService;

    public Map<String, Object> status() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("database", Map.of("status", "UP", "role", "source of truth"));

        Map<String, Object> redisInfo = new LinkedHashMap<>();
        redisInfo.put("enabled", redisAvailability.isEnabled());
        String redisState = "DISABLED";
        if (redisAvailability.isEnabled()) {
            redisState = redisAvailability.call("ping",
                            () -> redis.execute((org.springframework.data.redis.core.RedisCallback<String>) c -> c.ping()))
                    .map(p -> "UP").orElse("DOWN");
        }
        redisInfo.put("status", redisState);
        redisInfo.put("failures", redisAvailability.failureCount());
        redisInfo.put("lastError", redisAvailability.lastError());
        redisInfo.put("cache", cacheService.stats());
        redisInfo.put("cartStorage", cartService.storageName());
        result.put("redis", redisInfo);

        int max = outboxPublisher.maxAttempts();
        Map<String, Object> outbox = new LinkedHashMap<>();
        outbox.put("pending", outboxRepository.countPending(max));
        outbox.put("parkedAfterMaxAttempts", outboxRepository.countExhausted(max));
        outbox.put("publishedSinceStart", outboxPublisher.publishedCount());
        outbox.put("failedAttemptsSinceStart", outboxPublisher.failedAttemptCount());
        outbox.put("lastPollAt", outboxPublisher.lastRunAt());
        result.put("outbox", outbox);
        return result;
    }

    @Transactional
    public int retryExhaustedOutbox() {
        return outboxRepository.resetExhausted(outboxPublisher.maxAttempts());
    }
}
