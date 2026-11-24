package com.ecomerce.controller;

import com.ecomerce.dto.AuthRequest;
import com.ecomerce.dto.AuthResponse;
import com.ecomerce.security.AuthCookieService;
import com.ecomerce.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final AuthCookieService authCookieService;
    private final com.ecomerce.security.OAuthLoginCodeStore oAuthLoginCodeStore;
    private final com.ecomerce.security.JwtUtil jwtUtil;
    private final com.ecomerce.ratelimit.RateLimiter rateLimiter;
    private final com.ecomerce.ratelimit.RateLimitPolicies rateLimitPolicies;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody AuthRequest.Register request,
                                                 HttpServletRequest httpRequest,
                                                 HttpServletResponse httpResponse) {
        AuthService.AuthSession session = authService.register(request);
        authCookieService.setTokenCookie(httpRequest, httpResponse, session.token());
        return ResponseEntity.status(HttpStatus.CREATED).body(AuthResponse.from(session.user()));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequest.Login request,
                                              HttpServletRequest httpRequest,
                                              HttpServletResponse httpResponse) {
        // Per-account limit on top of the per-IP limit, against password guessing spread over IPs.
        String account = request.getEmail() == null ? "" : request.getEmail().trim().toLowerCase();
        var decision = rateLimiter.acquire(rateLimitPolicies.named("auth-account"),
                "acct:" + com.ecomerce.ratelimit.RateLimiter.hashIdentity(account));
        if (!decision.allowed()) {
            throw new com.ecomerce.exception.RateLimitedException(decision.retryAfterSeconds());
        }
        AuthService.AuthSession session = authService.login(request);
        authCookieService.setTokenCookie(httpRequest, httpResponse, session.token());
        return ResponseEntity.ok(AuthResponse.from(session.user()));
    }

    /** Trades the one-time code from the Google/Facebook callback for the session. */
    @PostMapping("/oauth/exchange")
    public ResponseEntity<AuthResponse> exchangeOAuthCode(@RequestBody java.util.Map<String, String> body,
                                                          HttpServletRequest httpRequest,
                                                          HttpServletResponse httpResponse) {
        String token = oAuthLoginCodeStore.consume(body == null ? null : body.get("code"));
        if (token == null || !jwtUtil.isTokenValid(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        com.ecomerce.entity.User user = authService.requireByEmail(jwtUtil.extractEmail(token));
        authCookieService.setTokenCookie(httpRequest, httpResponse, token);
        AuthResponse response = AuthResponse.from(user);
        response.setToken(token);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> me(@AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(AuthResponse.from(authService.requireByEmail(userDetails.getUsername())));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<AuthResponse> verifyEmail(@Valid @RequestBody com.ecomerce.dto.VerifyEmailRequest request,
                                                    HttpServletRequest httpRequest,
                                                    HttpServletResponse httpResponse) {
        com.ecomerce.entity.User user = authService.verifyEmail(request.getToken());
        // Issue updated token with verified session
        String token = authService.tokenFor(user);
        authCookieService.setTokenCookie(httpRequest, httpResponse, token);
        return ResponseEntity.ok(AuthResponse.from(user));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<java.util.Map<String, String>> resendVerification(
            @Valid @RequestBody com.ecomerce.dto.ResendVerificationRequest request) {
        authService.resendVerification(request.getEmail());
        return ResponseEntity.ok(java.util.Map.of("message", "If an unverified account exists with that email, a verification link has been sent."));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        authCookieService.clearTokenCookie(request, response);
        return ResponseEntity.noContent().build();
    }
}
