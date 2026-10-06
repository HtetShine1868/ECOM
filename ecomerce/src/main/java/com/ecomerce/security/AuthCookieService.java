package com.ecomerce.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Duration;

@Component
public class AuthCookieService {

    public static final String COOKIE_NAME = "access_token";

    private final long expirationMs;
    private final String frontendUrl;

    public AuthCookieService(
            @Value("${app.jwt.expiration-ms}") long expirationMs,
            @Value("${app.oauth2.frontend-url}") String frontendUrl) {
        this.expirationMs = expirationMs;
        this.frontendUrl = frontendUrl;
    }

    public void setTokenCookie(HttpServletRequest request, HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie(request, token, Duration.ofMillis(expirationMs)).toString());
    }

    public void clearTokenCookie(HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie(request, "", Duration.ZERO).toString());
    }

    public String readToken(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private ResponseCookie buildCookie(HttpServletRequest request, String value, Duration maxAge) {
        boolean crossSite = isCrossSite(request);
        return ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(crossSite || request.isSecure())
                .path("/")
                .maxAge(maxAge)
                .sameSite(crossSite ? "None" : "Lax")
                .build();
    }

    private boolean isCrossSite(HttpServletRequest request) {
        String frontendHost = hostOf(frontendUrl);
        String requestHost = request.getServerName();
        if (frontendHost == null || requestHost == null) {
            return true;
        }
        return !frontendHost.equalsIgnoreCase(requestHost);
    }

    private static String hostOf(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return URI.create(value.trim()).getHost();
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
