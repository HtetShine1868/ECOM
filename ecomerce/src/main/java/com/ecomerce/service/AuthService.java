package com.ecomerce.service;

import com.ecomerce.dto.AuthRequest;
import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final AccountVerificationService accountVerificationService;

    @Transactional
    public AuthSession register(AuthRequest.Register request) {
        if (userRepository.existsByEmail(request.getEmail().trim().toLowerCase())) {
            throw new IllegalArgumentException("Email already in use: " + request.getEmail());
        }

        User user = userRepository.save(User.builder()
                .email(request.getEmail().trim().toLowerCase())
                .name(request.getName().trim())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(User.Role.BUYER)
                .emailVerified(false)
                .accountStatus(User.AccountStatus.PENDING_EMAIL)
                .build());

        accountVerificationService.createAndSendVerificationToken(user);

        return new AuthSession(user, tokenFor(user));
    }

    public AuthSession login(AuthRequest.Login request) {
        User user = userRepository.findByEmail(request.getEmail().trim().toLowerCase())
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));

        if (user.getPasswordHash() == null ||
                !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid email or password");
        }
        if (user.getAccountStatus() == User.AccountStatus.SUSPENDED) {
            throw new com.ecomerce.exception.AccountSuspendedException();
        }

        return new AuthSession(user, tokenFor(user));
    }

    @Transactional
    public User verifyEmail(String token) {
        return accountVerificationService.verifyEmail(token);
    }

    public void resendVerification(String email) {
        accountVerificationService.resendVerification(email);
    }

    public User requireByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new BadCredentialsException("Invalid session"));
    }

    public String tokenFor(User user) {
        return jwtUtil.generateToken(user.getEmail(), user.getRole().name(), user.getId(), user.getName());
    }

    public record AuthSession(User user, String token) {
    }
}
