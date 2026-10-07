package com.ecomerce.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * The API has no login screen. Facebook sometimes returns the browser to
 * /login#_=_ on this host; send that visit to the storefront instead.
 */
public class BackendLoginRedirectFilter extends OncePerRequestFilter {

    private final OAuthRedirectSupport redirectSupport;

    public BackendLoginRedirectFilter(OAuthRedirectSupport redirectSupport) {
        this.redirectSupport = redirectSupport;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (isApiLoginPage(request)) {
            redirectSupport.sendBrowser(response, redirectSupport.frontendLogin());
            return;
        }
        filterChain.doFilter(request, response);
    }

    private static boolean isApiLoginPage(HttpServletRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) {
            return false;
        }
        String uri = request.getRequestURI();
        return "/login".equals(uri) || "/login/".equals(uri);
    }
}
