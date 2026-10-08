package com.ecomerce.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

public class AuthRequest {

    @Data
    public static class Register {
        @NotBlank(message = "Name is required")
        @Size(max = 120, message = "Name must be 120 characters or less")
        private String name;

        @NotBlank(message = "Email is required")
        @Email(message = "Invalid email format")
        @Size(max = 180, message = "Email must be 180 characters or less")
        private String email;

        @NotBlank(message = "Password is required")
        @Size(min = 8, message = "Password must be at least 8 characters")
        private String password;
    }

    @Data
    public static class Login {
        @NotBlank(message = "Email is required")
        @Email(message = "Invalid email format")
        @Size(max = 180, message = "Email must be 180 characters or less")
        private String email;

        @NotBlank(message = "Password is required")
        private String password;
    }
}
