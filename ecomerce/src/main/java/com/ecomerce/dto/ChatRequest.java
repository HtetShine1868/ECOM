package com.ecomerce.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ChatRequest {

    @NotBlank(message = "Message is required")
    @Size(max = 400, message = "Message must be 400 characters or less")
    private String message;

    /** SUPPORT or PRODUCT. Optional — the service infers intent when blank. */
    @Size(max = 20)
    private String mode;
}
