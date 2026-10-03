package com.ecomerce.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.SerializationUtils;

import java.time.Duration;
import java.util.Base64;

/**
 * Stores the OAuth2 authorization request in a short-lived cookie.
 * The API itself is stateless, and a session cannot be relied on when the
 * callback hits a different server instance. Losing this request is what
 * sends the browser back to the Google/Facebook login page.
 */
@Component
public class CookieOAuth2AuthorizationRequestRepository
        implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    static final String COOKIE_NAME = "oauth2_auth_request";
    private static final Duration MAX_AGE = Duration.ofMinutes(3);

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        return readCookie(request);
    }

    @Override
    public void saveAuthorizationRequest(OAuth2AuthorizationRequest authorizationRequest,
                                         HttpServletRequest request,
                                         HttpServletResponse response) {
        if (authorizationRequest == null) {
            deleteCookie(request, response);
            return;
        }
        String value = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(SerializationUtils.serialize(authorizationRequest));
        addCookie(request, response, value, MAX_AGE);
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request,
                                                                  HttpServletResponse response) {
        OAuth2AuthorizationRequest stored = loadAuthorizationRequest(request);
        if (response != null) {
            deleteCookie(request, response);
        }
        return stored;
    }

    private OAuth2AuthorizationRequest readCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (var cookie : request.getCookies()) {
            if (!COOKIE_NAME.equals(cookie.getName()) || cookie.getValue() == null || cookie.getValue().isBlank()) {
                continue;
            }
            try {
                byte[] bytes = Base64.getUrlDecoder().decode(cookie.getValue());
                Object value = SerializationUtils.deserialize(bytes);
                if (value instanceof OAuth2AuthorizationRequest authorizationRequest) {
                    return authorizationRequest;
                }
            } catch (RuntimeException ignored) {
                return null;
            }
        }
        return null;
    }

    private void addCookie(HttpServletRequest request, HttpServletResponse response, String value, Duration maxAge) {
        response.addHeader(HttpHeaders.SET_COOKIE, baseCookie(request, value, maxAge).toString());
    }

    private void deleteCookie(HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, baseCookie(request, "", Duration.ZERO).toString());
    }

    private ResponseCookie baseCookie(HttpServletRequest request, String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(request.isSecure())
                .path("/")
                .maxAge(maxAge)
                .sameSite("Lax")
                .build();
    }
}
