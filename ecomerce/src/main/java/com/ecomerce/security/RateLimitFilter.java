package com.ecomerce.security;

import com.ecomerce.exception.GlobalExceptionHandler;
import com.ecomerce.ratelimit.RateLimitPolicies;
import com.ecomerce.ratelimit.RateLimiter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;

/**
 * Applies {@link RateLimitPolicies} to API requests. Runs after JWT authentication, so
 * signed-in users are limited per account (not per shared IP); anonymous requests are
 * limited per client IP.
 *
 * The client IP is {@code request.getRemoteAddr()}: with server.forward-headers-strategy=NATIVE,
 * Tomcat replaces it with X-Forwarded-For only when the direct peer is a trusted proxy, so a
 * client cannot pick its own IP by sending the header.
 *
 * Rejections are 429 with the standard error body and a Retry-After header.
 */
@Component
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimitPolicies policies;
    private final RateLimiter rateLimiter;
    private final ObjectMapper objectMapper;

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled = true;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        Optional<RateLimitPolicies.Policy> policy = enabled
                ? policies.forRequest(request.getMethod(), request.getRequestURI())
                : Optional.empty();
        if (policy.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }

        String identity = CurrentUser.currentEmail()
                .map(email -> "u:" + RateLimiter.hashIdentity(email.toLowerCase()))
                .orElseGet(() -> "ip:" + RateLimiter.hashIdentity(request.getRemoteAddr()));

        RateLimiter.Decision decision = rateLimiter.acquire(policy.get(), identity);
        response.setHeader("X-RateLimit-Limit", String.valueOf(policy.get().maxRequests()));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(decision.remaining()));
        if (decision.allowed()) {
            chain.doFilter(request, response);
            return;
        }

        response.setStatus(429);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(decision.retryAfterSeconds()));
        objectMapper.writeValue(response.getOutputStream(), GlobalExceptionHandler.body(
                "RATE_LIMITED",
                "Too many requests. Please wait " + decision.retryAfterSeconds() + " seconds and try again.",
                Map.of("retryAfterSeconds", decision.retryAfterSeconds(), "policy", policy.get().name())));
    }
}
