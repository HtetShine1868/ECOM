package com.ecomerce.security;

import com.ecomerce.entity.User;
import com.ecomerce.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** Resolves the authenticated principal to a database user. */
@Component
@RequiredArgsConstructor
public class CurrentUser {

    private final UserRepository userRepository;

    public Long id(UserDetails principal) {
        return user(principal).getId();
    }

    public User user(UserDetails principal) {
        if (principal == null) {
            throw new InsufficientAuthenticationException("Login required");
        }
        return userRepository.findByEmail(principal.getUsername())
                .orElseThrow(() -> new InsufficientAuthenticationException("Login required"));
    }

    /** The signed-in user's email from the security context, if any (used for audit). */
    public static Optional<String> currentEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof UserDetails ud)) {
            return Optional.empty();
        }
        return Optional.of(ud.getUsername());
    }
}
