package com.ecomerce.service;

import com.ecomerce.dto.AuthRequest;
import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthSession register(AuthRequest.Register request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already in use: " + request.getEmail());
        }

        User user = userRepository.save(User.builder()
                .email(request.getEmail())
                .name(request.getName())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(User.Role.BUYER)
                .build());

        return new AuthSession(user, tokenFor(user));
    }

    public AuthSession login(AuthRequest.Login request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));

        if (user.getPasswordHash() == null ||
                !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid email or password");
        }

        return new AuthSession(user, tokenFor(user));
    }

    public User requireByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new BadCredentialsException("Invalid session"));
    }

    private String tokenFor(User user) {
        return jwtUtil.generateToken(user.getEmail(), user.getRole().name(), user.getId(), user.getName());
    }

    public record AuthSession(User user, String token) {
    }
}
