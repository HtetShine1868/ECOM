package com.ecomerce.ratelimit;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Maps a request to a rate-limit policy. Pure routing logic, unit-tested.
 *
 * | Category         | Applies to                               | Keyed by         |
 * |------------------|------------------------------------------|------------------|
 * | auth             | POST /api/auth/login, /register          | IP               |
 * | auth-account     | login attempts for one email (AuthController) | account     |
 * | checkout         | POST /api/orders                         | user             |
 * | cart             | POST/PUT/DELETE /api/cart/**             | user             |
 * | search           | GET /api/products (listing/search)       | user, else IP    |
 * | product          | GET /api/products/{id}, /categories ...  | user, else IP    |
 * | admin            | /api/admin/**                            | user             |
 * | chat             | POST /api/chat                           | user, else IP    |
 */
@Component
public class RateLimitPolicies {

    public record Policy(String name, int maxRequests, long windowSeconds, boolean perUser) {
    }

    private final Environment env;

    public RateLimitPolicies(Environment env) {
        this.env = env;
    }

    public Optional<Policy> forRequest(String method, String path) {
        if (path == null || !path.startsWith("/api/")) {
            return Optional.empty();
        }
        boolean get = "GET".equalsIgnoreCase(method);
        boolean post = "POST".equalsIgnoreCase(method);

        if (post && ("/api/auth/login".equals(path) || "/api/auth/register".equals(path))) {
            return Optional.of(policy("auth", false));
        }
        if (post && "/api/orders".equals(path)) {
            return Optional.of(policy("checkout", true));
        }
        if (path.startsWith("/api/cart") && !get && !"OPTIONS".equalsIgnoreCase(method)) {
            return Optional.of(policy("cart", true));
        }
        if (path.startsWith("/api/admin/")) {
            return Optional.of(policy("admin", true));
        }
        if (post && "/api/chat".equals(path)) {
            return Optional.of(policy("chat", false));
        }
        if (get && "/api/products".equals(path)) {
            return Optional.of(policy("search", false));
        }
        if (get && (path.startsWith("/api/products/") || path.startsWith("/api/categories"))) {
            return Optional.of(policy("product", false));
        }
        return Optional.empty();
    }

    public Policy named(String name) {
        return policy(name, true);
    }

    private Policy policy(String name, boolean perUser) {
        int max = env.getProperty("app.rate-limit." + name + ".max-requests", Integer.class, defaultMax(name));
        long window = env.getProperty("app.rate-limit." + name + ".window-seconds", Long.class, 60L);
        return new Policy(name, Math.max(1, max), Math.max(1, window), perUser);
    }

    private static int defaultMax(String name) {
        return switch (name) {
            case "auth" -> 20;
            case "auth-account" -> 8;
            case "checkout" -> 10;
            case "cart" -> 90;
            case "search" -> 150;
            case "product" -> 400;
            case "admin" -> 600;
            case "chat" -> 30;
            default -> 100;
        };
    }
}
