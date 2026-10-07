package com.ecomerce.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Remembers which frontend started the Google/Facebook login so the browser
 * returns there (local dev or the deployed site) instead of the provider page.
 */
@Component
public class OAuthRedirectSupport {

    static final String COOKIE_NAME = "oauth2_post_login";

    private final String frontendUrl;
    private final Set<String> allowedOrigins;

    public OAuthRedirectSupport(
            @Value("${app.oauth2.frontend-url}") String frontendUrl,
            @Value("${app.oauth2.allowed-redirects:}") String allowedRedirects) {
        this.frontendUrl = stripTrailingSlash(frontendUrl);
        this.allowedOrigins = new LinkedHashSet<>();
        String configured = originOf(this.frontendUrl);
        if (configured != null) {
            this.allowedOrigins.add(configured);
        }
        if (allowedRedirects != null) {
            Arrays.stream(allowedRedirects.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(OAuthRedirectSupport::originOf)
                    .filter(s -> s != null)
                    .forEach(this.allowedOrigins::add);
        }
    }

    public void rememberRedirect(HttpServletRequest request, HttpServletResponse response) {
        String safe = sanitize(request.getParameter("redirect"));
        if (safe == null) return;
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(request, safe, Duration.ofMinutes(5)).toString());
    }

    public String resolveBase(HttpServletRequest request, HttpServletResponse response) {
        String fromCookie = sanitize(readCookie(request));
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(request, "", Duration.ZERO).toString());
        String base = fromCookie != null ? fromCookie : frontendUrl;
        if (base.isBlank() || sameHost(base, request.getServerName())) {
            return frontendUrl;
        }
        return base;
    }

    public String frontendLogin() {
        return frontendUrl + "/login";
    }

    /**
     * Facebook appends #_=_ to the callback. A 302 keeps that fragment, so the
     * browser stays on the API /login page. A script navigation replaces it.
     */
    public void sendBrowser(HttpServletResponse response, String target) throws IOException {
        response.setStatus(HttpServletResponse.SC_OK);
        response.setCharacterEncoding("UTF-8");
        response.setContentType("text/html;charset=UTF-8");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.getWriter().write("""
                <!DOCTYPE html>
                <html><head><meta charset="utf-8"><title>Redirecting</title></head>
                <body><script>location.replace(%s);</script></body></html>
                """.formatted(jsString(target)));
    }

    private static boolean sameHost(String url, String host) {
        if (host == null || host.isBlank()) return false;
        String originHost = hostOf(url);
        return originHost != null && originHost.equalsIgnoreCase(host);
    }

    private static String hostOf(String value) {
        try {
            return URI.create(value).getHost();
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String jsString(String value) {
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "")
                .replace("\n", "") + "\"";
    }

    private String readCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (var cookie : request.getCookies()) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private ResponseCookie cookie(HttpServletRequest request, String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(request.isSecure())
                .path("/")
                .maxAge(maxAge)
                .sameSite("Lax")
                .build();
    }

    private String sanitize(String value) {
        String origin = originOf(value);
        if (origin == null || !allowedOrigins.contains(origin)) return null;
        return origin;
    }

    private static String originOf(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            URI uri = URI.create(value.trim());
            if (uri.getScheme() == null || uri.getHost() == null) return null;
            if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) return null;
            if (uri.getRawQuery() != null || uri.getFragment() != null) return null;
            String path = uri.getPath();
            if (path != null && !path.isEmpty() && !"/".equals(path)) return null;
            int port = uri.getPort();
            return uri.getScheme().toLowerCase() + "://" + uri.getHost().toLowerCase()
                    + (port > 0 ? ":" + port : "");
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String stripTrailingSlash(String value) {
        if (value == null) return "";
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
