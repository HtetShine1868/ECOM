package com.ecomerce.controller;

import com.ecomerce.cart.CartService;
import com.ecomerce.dto.CartRequest;
import com.ecomerce.dto.CartResponse;
import com.ecomerce.security.CurrentUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/**
 * Cart API. Paths use the product ID for item operations.
 * Cart operations never change or reserve stock.
 */
@RestController
@RequestMapping("/api/cart")
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;
    private final CurrentUser currentUser;

    @GetMapping
    public ResponseEntity<CartResponse> getCart(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(cartService.getCart(currentUser.id(principal)));
    }

    @PostMapping("/items")
    public ResponseEntity<CartResponse> addItem(@AuthenticationPrincipal UserDetails principal,
                                                @Valid @RequestBody CartRequest.AddItem request) {
        return ResponseEntity.ok(cartService.addItem(currentUser.id(principal),
                request.getProductId(), request.getQuantity()));
    }

    @PutMapping("/items/{productId}")
    public ResponseEntity<CartResponse> updateItem(@AuthenticationPrincipal UserDetails principal,
                                                   @PathVariable Long productId,
                                                   @Valid @RequestBody CartRequest.UpdateItem request) {
        return ResponseEntity.ok(cartService.updateItem(currentUser.id(principal), productId, request.getQuantity()));
    }

    @DeleteMapping("/items/{productId}")
    public ResponseEntity<CartResponse> removeItem(@AuthenticationPrincipal UserDetails principal,
                                                   @PathVariable Long productId) {
        return ResponseEntity.ok(cartService.removeItem(currentUser.id(principal), productId));
    }

    /** The customer reviewed the current prices; stop flagging them as changed. */
    @PostMapping("/acknowledge-prices")
    public ResponseEntity<CartResponse> acknowledgePrices(@AuthenticationPrincipal UserDetails principal) {
        return ResponseEntity.ok(cartService.acknowledgePrices(currentUser.id(principal)));
    }

    @DeleteMapping
    public ResponseEntity<Void> clearCart(@AuthenticationPrincipal UserDetails principal) {
        cartService.clearCart(currentUser.id(principal));
        return ResponseEntity.noContent().build();
    }
}
