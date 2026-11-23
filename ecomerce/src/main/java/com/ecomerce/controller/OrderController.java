package com.ecomerce.controller;

import com.ecomerce.dto.OrderRequest;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.checkout.CheckoutService;
import com.ecomerce.security.CurrentUser;
import com.ecomerce.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;
    private final CheckoutService checkoutService;
    private final CurrentUser currentUser;

    @PostMapping
    public ResponseEntity<OrderResponse> placeOrder(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKeyHeader,
            @Valid @RequestBody OrderRequest request) {
        Long userId = resolveUserId(userDetails);
        // The key may come in the standard header or the body (older clients).
        if ((request.getIdempotencyKey() == null || request.getIdempotencyKey().isBlank())
                && idempotencyKeyHeader != null) {
            request.setIdempotencyKey(idempotencyKeyHeader.trim());
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(checkoutService.placeOrder(userId, request));
    }

    @GetMapping
    public ResponseEntity<List<OrderResponse>> getMyOrders(
            @AuthenticationPrincipal UserDetails userDetails) {
        Long userId = resolveUserId(userDetails);
        return ResponseEntity.ok(orderService.getMyOrders(userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<OrderResponse> getOrder(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable Long id) {
        Long userId = resolveUserId(userDetails);
        // Pass false — customer can only see their own
        return ResponseEntity.ok(orderService.getOrderById(id, userId, false));
    }

    private Long resolveUserId(UserDetails userDetails) {
        return currentUser.id(userDetails);
    }
}
