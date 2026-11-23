package com.ecomerce.cart;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Redis cart.
 *
 * <pre>
 *   cart:user:{userId}        HASH  productId -> quantity
 *   cart:user:{userId}:seen   HASH  productId -> price the customer last reviewed
 * </pre>
 * The braces are a Redis hash tag, so both keys of one user live in the same cluster slot
 * and the Lua script below can touch both atomically.
 *
 * Both keys expire after {@code app.cart.ttl-days} of inactivity. Carts are temporary:
 * they survive a Redis restart only if the Redis instance has persistence (AOF/RDB) enabled.
 */
@Component
@RequiredArgsConstructor
public class RedisCartStore implements CartStore {

    /**
     * KEYS[1]=cart hash, KEYS[2]=seen hash
     * ARGV[1]=productId, ARGV[2]=increment, ARGV[3]=max qty, ARGV[4]=max distinct,
     * ARGV[5]=current price, ARGV[6]=ttl seconds
     */
    private static final DefaultRedisScript<Long> ADD_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0
               and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[4]) then
              return -1
            end
            local q = redis.call('HINCRBY', KEYS[1], ARGV[1], ARGV[2])
            if q > tonumber(ARGV[3]) then
              redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
              q = tonumber(ARGV[3])
            end
            redis.call('HSETNX', KEYS[2], ARGV[1], ARGV[5])
            redis.call('EXPIRE', KEYS[1], ARGV[6])
            redis.call('EXPIRE', KEYS[2], ARGV[6])
            return q
            """, Long.class);

    private final StringRedisTemplate redis;

    @Value("${app.cart.ttl-days:7}")
    private long ttlDays;

    @Override
    public String name() {
        return "REDIS";
    }

    @Override
    public List<Line> lines(Long userId) {
        Map<String, String> quantities = hash().entries(cartKey(userId));
        if (quantities.isEmpty()) {
            return List.of();
        }
        Map<String, String> seen = hash().entries(seenKey(userId));
        touch(userId);
        List<Line> lines = new ArrayList<>();
        for (Map.Entry<String, String> e : quantities.entrySet()) {
            try {
                long productId = Long.parseLong(e.getKey());
                int quantity = Integer.parseInt(e.getValue());
                if (quantity <= 0) continue;
                String seenPrice = seen.get(e.getKey());
                lines.add(new Line(productId, quantity, seenPrice == null ? null : new BigDecimal(seenPrice)));
            } catch (NumberFormatException ignored) {
                // Malformed entry: skip it rather than failing the whole cart.
            }
        }
        return lines;
    }

    @Override
    public int quantityOf(Long userId, Long productId) {
        String value = hash().get(cartKey(userId), String.valueOf(productId));
        try {
            return value == null ? 0 : Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    @Override
    public int add(Long userId, Long productId, int quantity, int maxQuantity, int maxDistinct, BigDecimal currentPrice) {
        Long result = redis.execute(ADD_SCRIPT,
                List.of(cartKey(userId), seenKey(userId)),
                String.valueOf(productId),
                String.valueOf(quantity),
                String.valueOf(maxQuantity),
                String.valueOf(maxDistinct),
                currentPrice.toPlainString(),
                String.valueOf(ttl().toSeconds()));
        return result == null ? 0 : result.intValue();
    }

    @Override
    public void setQuantity(Long userId, Long productId, int quantity, BigDecimal currentPriceIfNew) {
        String field = String.valueOf(productId);
        hash().put(cartKey(userId), field, String.valueOf(quantity));
        hash().putIfAbsent(seenKey(userId), field, currentPriceIfNew.toPlainString());
        touch(userId);
    }

    @Override
    public void remove(Long userId, Long productId) {
        String field = String.valueOf(productId);
        hash().delete(cartKey(userId), field);
        hash().delete(seenKey(userId), field);
    }

    @Override
    public void removeAll(Long userId, Collection<Long> productIds) {
        if (productIds.isEmpty()) return;
        Object[] fields = productIds.stream().map(String::valueOf).toArray();
        hash().delete(cartKey(userId), fields);
        hash().delete(seenKey(userId), fields);
    }

    @Override
    public void clear(Long userId) {
        redis.delete(List.of(cartKey(userId), seenKey(userId)));
    }

    @Override
    public void acknowledgePrices(Long userId, Map<Long, BigDecimal> currentPrices) {
        if (currentPrices.isEmpty()) return;
        Map<String, String> values = new HashMap<>();
        currentPrices.forEach((id, price) -> values.put(String.valueOf(id), price.toPlainString()));
        hash().putAll(seenKey(userId), values);
        touch(userId);
    }

    static String cartKey(Long userId) {
        return "cart:user:{" + userId + "}";
    }

    static String seenKey(Long userId) {
        return cartKey(userId) + ":seen";
    }

    private void touch(Long userId) {
        redis.expire(cartKey(userId), ttl());
        redis.expire(seenKey(userId), ttl());
    }

    private Duration ttl() {
        return Duration.ofDays(Math.max(1, ttlDays));
    }

    private HashOperations<String, String, String> hash() {
        return redis.opsForHash();
    }
}
