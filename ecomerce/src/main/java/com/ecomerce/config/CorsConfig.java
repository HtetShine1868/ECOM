package com.ecomerce.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;

@Configuration
public class CorsConfig {

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    @Value("${app.oauth2.allowed-redirects:}")
    private String allowedRedirects;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        LinkedHashSet<String> origins = new LinkedHashSet<>();
        addOrigins(origins, allowedOrigins);
        addOrigins(origins, allowedRedirects);
        origins.add("http://localhost:5173");
        origins.add("http://127.0.0.1:5173");

        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.copyOf(origins));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return source;
    }

    private static void addOrigins(LinkedHashSet<String> origins, String raw) {
        if (raw == null || raw.isBlank()) return;
        Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .forEach(origins::add);
    }
}
