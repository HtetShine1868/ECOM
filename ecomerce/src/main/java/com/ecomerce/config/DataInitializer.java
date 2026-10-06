package com.ecomerce.config;

import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Set;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements ApplicationRunner {

    private static final Set<String> BLOCKED_ADMIN_PASSWORDS = Set.of(
            "admin@1234",
            "admin1234",
            "password",
            "password123",
            "542005fred!"
    );

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.email:}")
    private String adminEmail;

    @Value("${app.admin.password:}")
    private String adminPassword;

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.existsByRole(User.Role.ADMIN)) {
            log.info("Admin account already exists");
            return;
        }

        if (adminEmail == null || adminEmail.isBlank() || adminPassword == null || adminPassword.isBlank()) {
            throw new IllegalStateException(
                    "No admin user exists. Set ADMIN_EMAIL and ADMIN_PASSWORD before starting.");
        }
        if (isWeakAdminPassword(adminPassword)) {
            throw new IllegalStateException(
                    "ADMIN_PASSWORD is too weak. Use at least 12 characters and do not reuse a known default.");
        }

        User admin = User.builder()
                .email(adminEmail.trim())
                .name("Administrator")
                .passwordHash(passwordEncoder.encode(adminPassword))
                .role(User.Role.ADMIN)
                .build();
        userRepository.save(admin);
        log.info("Admin account created: {}", adminEmail);
    }

    private boolean isWeakAdminPassword(String password) {
        if (password.length() < 12) {
            return true;
        }
        return BLOCKED_ADMIN_PASSWORDS.contains(password.toLowerCase(Locale.ROOT));
    }
}
