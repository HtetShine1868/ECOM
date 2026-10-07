package com.ecomerce.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class ChatRequest {

    @NotBlank(message = "Message is required")
    @Size(max = 400, message = "Message must be 400 characters or less")
    private String message;

    /** SUPPORT or PRODUCT. Optional — the service infers intent when blank. */
    @Size(max = 20)
    private String mode;

    /** Recent turns so short follow-ups like "how much?" can use the product already discussed. */
    @Valid
    @Size(max = 8)
    private List<Turn> history = new ArrayList<>();

    @Data
    public static class Turn {
        @Size(max = 20)
        private String role;

        @Size(max = 500)
        private String text;
    }
}
