package com.ecomerce.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Checks text query parameters on API calls, including search boxes.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SqlSafeQueryFilter extends OncePerRequestFilter {

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        for (String[] values : request.getParameterMap().values()) {
            if (values == null) {
                continue;
            }
            for (String value : values) {
                if (SqlInjectionGuard.isUnsafe(value)) {
                    response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.getWriter().write("{\"message\":\"" + SqlInjectionGuard.MESSAGE + "\"}");
                    return;
                }
            }
        }
        filterChain.doFilter(request, response);
    }
}
