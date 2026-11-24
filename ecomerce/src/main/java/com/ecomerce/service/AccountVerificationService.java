package com.ecomerce.service;

import com.ecomerce.entity.EmailVerificationToken;
import com.ecomerce.entity.User;
import com.ecomerce.exception.AccountSuspendedException;
import com.ecomerce.exception.EmailNotVerifiedException;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.EmailVerificationTokenRepository;
import com.ecomerce.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccountVerificationService {

    private final UserRepository userRepository;
    private final EmailVerificationTokenRepository tokenRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${app.auth.verification-token-ttl-hours:24}")
    private int tokenTtlHours = 24;

    @Value("${app.auth.resend-cooldown-seconds:60}")
    private int resendCooldownSeconds = 60;

    @Value("${app.frontend.url:http://localhost:5173}")
    private String frontendUrl;

    private final com.ecomerce.mail.MailService mailService;

    /** Same rule as {@link #requireVerifiedEmail} without exceptions, for "can this shopper..." checks. */
    @Transactional(readOnly = true)
    public boolean isVerifiedAndActive(Long userId) {
        return userRepository.findById(userId)
                .map(u -> u.getAccountStatus() != User.AccountStatus.SUSPENDED && Boolean.TRUE.equals(u.getEmailVerified()))
                .orElse(false);
    }

    /**
     * Enforce verified email & active account. Throws UnauthorizedException with specific error code if unverified.
     */
    @Transactional(readOnly = true)
    public void requireVerifiedEmail(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        if (user.getAccountStatus() == User.AccountStatus.SUSPENDED) {
            throw new AccountSuspendedException();
        }

        if (!Boolean.TRUE.equals(user.getEmailVerified())) {
            throw new EmailNotVerifiedException();
        }
    }

    /**
     * Create and send email verification token for user.
     */
    @Transactional
    public void createAndSendVerificationToken(User user) {
        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            log.info("Skipping email verification for already verified user: {}", user.getEmail());
            return;
        }

        OffsetDateTime now = OffsetDateTime.now();

        // Check resend cooldown
        if (user.getEmailVerificationSentAt() != null) {
            OffsetDateTime cooldownEnd = user.getEmailVerificationSentAt().plusSeconds(resendCooldownSeconds);
            if (now.isBefore(cooldownEnd)) {
                long waitSecs = java.time.Duration.between(now, cooldownEnd).toSeconds() + 1;
                throw new IllegalStateException("Please wait " + waitSecs + " seconds before requesting another verification email.");
            }
        }

        // Invalidate previous tokens
        tokenRepository.invalidateUnusedTokensForUser(user, now);

        // Generate cryptographically secure token
        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);
        String rawToken = HexFormat.of().formatHex(randomBytes);
        String tokenHash = sha256(rawToken);

        EmailVerificationToken token = EmailVerificationToken.builder()
                .user(user)
                .tokenHash(tokenHash)
                .expiresAt(now.plusHours(tokenTtlHours))
                .build();
        tokenRepository.save(token);

        user.setEmailVerificationSentAt(now);
        userRepository.save(user);

        sendVerificationEmail(user.getEmail(), user.getName(), rawToken);
    }

    /**
     * Resend verification token by email without leaking account existence.
     */
    @Transactional
    public void resendVerification(String email) {
        if (email == null || email.isBlank()) return;

        Optional<User> userOpt = userRepository.findByEmail(email.trim().toLowerCase());
        if (userOpt.isEmpty()) {
            // Do not disclose whether an account exists
            log.info("Resend verification requested for non-existent email: {}", email);
            return;
        }

        User user = userOpt.get();
        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            log.info("Resend verification requested for already verified account: {}", email);
            return;
        }

        try {
            createAndSendVerificationToken(user);
        } catch (IllegalStateException cooldown) {
            // Same answer whether or not an email went out: the caller learns nothing about the account.
            log.info("Resend verification skipped (cooldown) for user {}", user.getId());
        }
    }

    /**
     * Validate verification token and mark account as active & verified.
     */
    @Transactional
    public User verifyEmail(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new IllegalArgumentException("Invalid verification token");
        }

        String hash = sha256(rawToken.trim());
        EmailVerificationToken token = tokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired verification token"));

        if (token.isUsed()) {
            throw new IllegalArgumentException("This verification link has already been used");
        }

        if (token.isExpired()) {
            throw new IllegalArgumentException("Verification link has expired. Please request a new one.");
        }

        OffsetDateTime now = OffsetDateTime.now();
        token.setUsedAt(now);
        tokenRepository.save(token);

        User user = token.getUser();
        user.setEmailVerified(true);
        user.setEmailVerifiedAt(now);
        if (user.getAccountStatus() != User.AccountStatus.SUSPENDED) {
            user.setAccountStatus(User.AccountStatus.ACTIVE);
        }
        return userRepository.save(user);
    }

    private void sendVerificationEmail(String toEmail, String name, String rawToken) {
        String base = frontendUrl.endsWith("/") ? frontendUrl.substring(0, frontendUrl.length() - 1) : frontendUrl;
        String verifyUrl = base + "/verify-email?token=" + rawToken;
        // Send only after the transaction commits, so the link can never arrive before its token exists.
        Runnable send = () -> mailService.sendVerificationEmail(toEmail, name, verifyUrl, tokenTtlHours);
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            send.run();
                        }
                    });
        } else {
            send.run();
        }
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm missing", e);
        }
    }
}
