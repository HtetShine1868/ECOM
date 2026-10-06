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
        AuthService.AuthSession session = authService.login(request);
        authCookieService.setTokenCookie(httpRequest, httpResponse, session.token());
        return ResponseEntity.ok(AuthResponse.from(session.user()));
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> me(@AuthenticationPrincipal UserDetails userDetails) {
        if (userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(AuthResponse.from(authService.requireByEmail(userDetails.getUsername())));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        authCookieService.clearTokenCookie(request, response);
        return ResponseEntity.noContent().build();
    }
}
