package com.ecomerce.dto;

import com.ecomerce.entity.UserProductEvent;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class TrackEventRequest {
    @NotNull(message = "Product ID is required")
    private Long productId;

    @NotNull(message = "Event type is required")
    private UserProductEvent.EventType eventType;

    private String sessionId;
}
