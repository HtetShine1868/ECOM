package com.ecomerce.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Captures ?redirect= on /oauth2/authorization/{provider} before Spring
 * sends the browser to Google or Facebook.
 */
public class OAuthRedirectCaptureFilter extends OncePerRequestFilter {

    private final OAuthRedirectSupport redirectSupport;

    public OAuthRedirectCaptureFilter(OAuthRedirectSupport redirectSupport) {
        this.redirectSupport = redirectSupport;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String uri = request.getRequestURI();
        if (uri != null && uri.contains("/oauth2/authorization/")) {
            redirectSupport.rememberRedirect(request, response);
        }
        filterChain.doFilter(request, response);
    }
}
