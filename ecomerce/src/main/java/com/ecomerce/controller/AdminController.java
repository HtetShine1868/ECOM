package com.ecomerce.controller;

import com.ecomerce.dto.AnalyticsResponse;
import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.OrderStatusUpdateRequest;
import com.ecomerce.dto.ProductRequest;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.dto.OrderResponse;
import com.ecomerce.entity.AuditLog;
import com.ecomerce.entity.Order;
import com.ecomerce.entity.Product;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.service.AdminService;
import com.ecomerce.service.AnalyticsService;
import com.ecomerce.service.AuditService;
import com.ecomerce.service.ProductService;
import com.ecomerce.service.StorageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final ProductService productService;
    private final StorageService storageService;
    private final AdminService adminService;
    private final AnalyticsService analyticsService;
    private final AuditService auditService;
    private final UserRepository userRepository;
    private final com.ecomerce.service.SystemStatusService systemStatusService;

    private static final java.util.Set<String> ADMIN_SORT_FIELDS =
            java.util.Set.of("createdAt", "updatedAt", "name", "price", "stock");

    // ----- Product Management -----

    /**
     * Admin product listing — includes inactive products.
     */
    @GetMapping("/products")
    public ResponseEntity<Page<ProductResponse>> listProducts(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Boolean inStock,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {
        if (!ADMIN_SORT_FIELDS.contains(sortBy)) {
            sortBy = "createdAt";
        }
        size = Math.min(Math.max(size, 1), 100);
        Sort sort = sortDir.equalsIgnoreCase("asc")
                ? Sort.by(sortBy).ascending()
                : Sort.by(sortBy).descending();
        Pageable pageable = PageRequest.of(page, size, sort);
        return ResponseEntity.ok(
                productService.getProductsAdmin(search, categoryId, minPrice, maxPrice, inStock, pageable));
    }

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
        String oldImageUrl = productService.getProductFresh(id).getImageUrl(); // never a cached value

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
        return ResponseEntity.ok(productService.getBestSellers(categoryId, limit, false));
    }

    // ----- Order Management (Admin) -----
    @GetMapping("/orders")
    public ResponseEntity<List<OrderResponse>> getAllOrders() {
        return ResponseEntity.ok(adminService.getAllOrders());
    }

    @GetMapping("/orders/{id}")
    public ResponseEntity<OrderResponse> getOrder(@PathVariable Long id) {
        return ResponseEntity.ok(adminService.getOrderById(id));
    }

    @PutMapping("/orders/{id}/status")
    public ResponseEntity<OrderResponse> updateOrderStatus(@PathVariable Long id,
                                                            @Valid @RequestBody OrderStatusUpdateRequest request) {
        OrderResponse updated = adminService.updateOrderStatus(id, request.getStatus());
        return ResponseEntity.ok(updated);
    }

    @GetMapping("/analytics")
    public ResponseEntity<AnalyticsResponse> analytics(
            @RequestParam(defaultValue = "last30") String range,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            @RequestParam(defaultValue = "5") int lowStockThreshold) {
        return ResponseEntity.ok(analyticsService.summarize(range, from, to, lowStockThreshold));
    }

    // ----- Audit Logs (Admin) -----
    @GetMapping("/audit-logs")
    public ResponseEntity<Page<AuditLog>> getAuditLogs(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String entityId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        return ResponseEntity.ok(auditService.getLogs(entityType, entityId, pageable));
    }

    // ----- Operations -----

    /** Redis / outbox health for operators. Admin only; no secrets. */
    @GetMapping("/system/status")
    public ResponseEntity<java.util.Map<String, Object>> systemStatus() {
        return ResponseEntity.ok(systemStatusService.status());
    }

    /** Give outbox events that exhausted their publish attempts a fresh set of attempts. */
    @PostMapping("/system/outbox/retry-failed")
    public ResponseEntity<java.util.Map<String, Object>> retryFailedOutbox() {
        return ResponseEntity.ok(java.util.Map.of("reset", systemStatusService.retryExhaustedOutbox()));
    }
}

