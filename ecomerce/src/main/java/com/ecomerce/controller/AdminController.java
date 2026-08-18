package com.ecomerce.controller;

import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.OrderStatusUpdateRequest;
import com.ecomerce.dto.ProductRequest;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.entity.Order;
import com.ecomerce.entity.Product;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.service.AdminService;
import com.ecomerce.service.ProductService;
import com.ecomerce.service.StorageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final ProductService productService;
    private final StorageService storageService;
    private final AdminService adminService;
    private final UserRepository userRepository;

    // ----- Product Management -----
    @PostMapping("/products")
    public ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody ProductRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(productService.createProduct(request));
    }

    @PutMapping("/products/{id}")
    public ResponseEntity<ProductResponse> updateProduct(@PathVariable Long id,
                                                         @Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(productService.updateProduct(id, request));
    }

    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        productService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/products/{id}/image")
    public ResponseEntity<ProductResponse> uploadProductImage(@PathVariable Long id,
                                                               @RequestParam("file") MultipartFile file) throws IOException {
        // Capture the existing image URL before we overwrite it
        String oldImageUrl = productService.getProductById(id).getImageUrl();

        // Upload new image to Supabase Storage → get public URL
        String newImageUrl = storageService.uploadProductImage(file);

        // Persist new URL in PostgreSQL
        ProductResponse updated = productService.updateProductImage(id, newImageUrl);

        // Delete old image from Supabase Storage (no-op if null/blank, errors are logged)
        storageService.deleteProductImage(oldImageUrl);

        return ResponseEntity.ok(updated);
    }

    // ----- Best-Sellers Dashboard (Admin) -----

    /**
     * GET /api/admin/products/best-sellers
     * Returns products ranked by total quantity sold — for the admin dashboard.
     * Optional query params:
     *   categoryId — filter by category
     *   limit      — max results (default 20)
     */
    @GetMapping("/products/best-sellers")
    public ResponseEntity<List<BestSellerResponse>> getAdminBestSellers(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(defaultValue = "20") int limit) {
        return ResponseEntity.ok(productService.getBestSellers(categoryId, limit));
    }

    // ----- Order Management (Admin) -----
    @GetMapping("/orders")
    public ResponseEntity<List<OrderResponse>> getAllOrders() {
        return ResponseEntity.ok(adminService.getAllOrders());
    }

    @GetMapping("/orders/{id}")
    public ResponseEntity<OrderResponse> getOrder(@PathVariable Long id) {
        Order order = adminService.getOrderById(id);
        return ResponseEntity.ok(OrderResponse.from(order));
    }

    @PutMapping("/orders/{id}/status")
    public ResponseEntity<OrderResponse> updateOrderStatus(@PathVariable Long id,
                                                            @Valid @RequestBody OrderStatusUpdateRequest request) {
        OrderResponse updated = adminService.updateOrderStatus(id, request.getStatus());
        return ResponseEntity.ok(updated);
    }
}
