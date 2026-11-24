package com.ecomerce.dto;

import com.ecomerce.entity.User;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AuthResponse {
    private Long userId;
    private String email;
    private String name;
    private String role;
    private Boolean emailVerified;
    private String accountStatus;

    /** Only set by the OAuth code exchange, for browsers that block the cross-site cookie. */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private String token;

    public static AuthResponse from(User user) {
        return AuthResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .role(user.getRole().name())
                .emailVerified(Boolean.TRUE.equals(user.getEmailVerified()))
                .accountStatus(user.getAccountStatus() != null ? user.getAccountStatus().name() : "ACTIVE")
                .build();
    }
}
