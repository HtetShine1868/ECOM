package com.ecomerce.config;

import com.ecomerce.security.BackendLoginRedirectFilter;
import com.ecomerce.security.CookieOAuth2AuthorizationRequestRepository;
import com.ecomerce.security.JwtAuthFilter;
import com.ecomerce.security.OAuth2LoginFailureHandler;
import com.ecomerce.security.OAuth2SuccessHandler;
import com.ecomerce.security.OAuthRedirectCaptureFilter;
import com.ecomerce.security.OAuthRedirectSupport;
import com.ecomerce.security.RateLimitFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.web.cors.CorsConfigurationSource;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final RateLimitFilter rateLimitFilter;
    private final OAuth2SuccessHandler oAuth2SuccessHandler;
    private final OAuth2LoginFailureHandler oAuth2LoginFailureHandler;
    private final CookieOAuth2AuthorizationRequestRepository authorizationRequestRepository;
    private final OAuthRedirectSupport oauthRedirectSupport;
    private final CorsConfigurationSource corsConfigurationSource;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/register", "/api/auth/logout").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/auth/me").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/categories/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/delivery-zones").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/chat").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/login", "/login/", "/login/oauth2/**", "/oauth2/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/cart/**").hasAnyRole("BUYER", "ADMIN")
                .requestMatchers("/api/orders/**").hasAnyRole("BUYER", "ADMIN")
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    if (request.getRequestURI().startsWith("/api/")) {
                        response.setStatus(401);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"message\":\"Unauthorized\"}");
                        return;
                    }
                    response.sendRedirect("/oauth2/authorization/google");
                }))
            .oauth2Login(oauth2 -> oauth2
                .authorizationEndpoint(endpoint -> endpoint
                    .authorizationRequestRepository(authorizationRequestRepository))
                .successHandler(oAuth2SuccessHandler)
                .failureHandler(oAuth2LoginFailureHandler)
            )
            .addFilterBefore(new BackendLoginRedirectFilter(oauthRedirectSupport),
                    SecurityContextHolderFilter.class)
            .addFilterBefore(new OAuthRedirectCaptureFilter(oauthRedirectSupport),
                    OAuth2AuthorizationRequestRedirectFilter.class)
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(rateLimitFilter, JwtAuthFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
