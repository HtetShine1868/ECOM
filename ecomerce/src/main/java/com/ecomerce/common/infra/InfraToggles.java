package com.ecomerce.common.infra;

import org.springframework.core.env.Environment;

/**
 * Decides whether the optional infrastructure (Redis) is switched on.
 *
 * Each toggle accepts {@code true}, {@code false} or {@code auto}. With {@code auto}
 * the dependency is enabled only when its connection URL is configured, so a local
 * run without Redis never waits on connection timeouts.
 */
public final class InfraToggles {

    private InfraToggles() {
    }

    public static boolean redisEnabled(Environment env) {
        return resolve(env.getProperty("app.redis.enabled", "auto"),
                hasText(env.getProperty("app.redis.url")));
    }

    static boolean resolve(String flag, boolean autoValue) {
        String value = flag == null ? "auto" : flag.trim().toLowerCase();
        return switch (value) {
            case "true", "yes", "on", "1" -> true;
            case "false", "no", "off", "0" -> false;
            default -> autoValue;
        };
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
