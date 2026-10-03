package com.ecomerce.config;

import com.ecomerce.security.CookieOAuth2AuthorizationRequestRepository;
import com.ecomerce.security.JwtAuthFilter;
import com.ecomerce.security.OAuth2LoginFailureHandler;
import com.ecomerce.security.OAuth2SuccessHandler;
import com.ecomerce.security.OAuthRedirectCaptureFilter;
import com.ecomerce.security.OAuthRedirectSupport;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final OAuth2SuccessHandler oAuth2SuccessHandler;
    private final OAuth2LoginFailureHandler oAuth2LoginFailureHandler;
    private final CookieOAuth2AuthorizationRequestRepository authorizationRequestRepository;
    private final OAuthRedirectSupport oauthRedirectSupport;
    private final CorsConfigurationSource corsConfigurationSource;
    private final OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> accessTokenResponseClient;
    private final OAuth2UserService<OAuth2UserRequest, OAuth2User> oauth2UserService;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .csrf(AbstractHttpConfigurer::disable)
            // OAuth2 needs a short-lived session cookie during the provider handshake.
            // API calls still authenticate with the JWT, not the session.
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .authorizeHttpRequests(auth -> auth
                // Allow CORS preflight requests
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // Public endpoints
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/categories/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/delivery-zones").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/chat").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/login/oauth2/**", "/oauth2/**").permitAll()
                // Admin-only
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                // Authenticated users
                .requestMatchers("/api/cart/**").hasAnyRole("BUYER", "ADMIN")
                .requestMatchers("/api/orders/**").hasAnyRole("BUYER", "ADMIN")
                // Everything else requires authentication
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth2 -> oauth2
                .authorizationEndpoint(endpoint -> endpoint
                    .authorizationRequestRepository(authorizationRequestRepository))
                .successHandler(oAuth2SuccessHandler)
                .failureHandler(oAuth2LoginFailureHandler)
                .tokenEndpoint(token -> token
                    .accessTokenResponseClient(accessTokenResponseClient))
                .userInfoEndpoint(userInfo -> userInfo
                    .userService(oauth2UserService))
            )
            .addFilterBefore(new OAuthRedirectCaptureFilter(oauthRedirectSupport),
                    OAuth2AuthorizationRequestRedirectFilter.class)
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

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
