package com.ecomerce.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        Limit limit = limitFor(request);
        if (limit == null) {
            filterChain.doFilter(request, response);
            return;
        }

        String key = clientIp(request) + ":" + limit.bucket();
        long now = Instant.now().toEpochMilli();
        long windowStart = now - limit.windowMs();
        Deque<Long> stamps = hits.computeIfAbsent(key, ignored -> new ArrayDeque<>());

        synchronized (stamps) {
            while (!stamps.isEmpty() && stamps.peekFirst() < windowStart) {
                stamps.pollFirst();
            }
            if (stamps.size() >= limit.maxRequests()) {
                response.setStatus(429);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setHeader("Retry-After", String.valueOf(limit.windowMs() / 1000));
                response.getWriter().write("{\"message\":\"Too many requests. Please try again shortly.\"}");
                return;
            }
            stamps.addLast(now);
        }

        if (hits.size() > 10_000) {
            hits.entrySet().removeIf(entry -> {
                Deque<Long> values = entry.getValue();
                synchronized (values) {
                    return values.isEmpty() || values.peekLast() < windowStart;
                }
            });
        }

        filterChain.doFilter(request, response);
    }

    private Limit limitFor(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if ("POST".equalsIgnoreCase(method) && ("/api/auth/login".equals(path) || "/api/auth/register".equals(path))) {
            return new Limit("auth", 5, 15 * 60 * 1000L);
        }
        if ("POST".equalsIgnoreCase(method) && "/api/chat".equals(path)) {
            return new Limit("chat", 30, 60 * 1000L);
        }
        return null;
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private record Limit(String bucket, int maxRequests, long windowMs) {
    }
}
