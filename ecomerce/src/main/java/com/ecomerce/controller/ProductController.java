package com.ecomerce.controller;

import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    /**
     * GET /api/products
     * Optional query params:
     *   search      — keyword search on product name
     *   categoryId  — filter by category
     *   minPrice    — minimum price (inclusive)
     *   maxPrice    — maximum price (inclusive)
     *   page, size  — pagination
     *   sortBy, direction — sorting
     */
    @GetMapping
    public ResponseEntity<Page<ProductResponse>> getProducts(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String direction) {

        Sort sort = direction.equalsIgnoreCase("asc")
                ? Sort.by(sortBy).ascending()
                : Sort.by(sortBy).descending();

        PageRequest pageable = PageRequest.of(page, size, sort);
        return ResponseEntity.ok(productService.getProducts(search, categoryId, minPrice, maxPrice, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getProduct(@PathVariable Long id) {
        return ResponseEntity.ok(productService.getProductById(id));
    }

    /**
     * GET /api/products/best-sellers
     * Returns products ranked by total quantity sold across all orders.
     * Optional query params:
     *   categoryId — filter by category
     *   limit      — max results (default 10)
     */
    @GetMapping("/best-sellers")
    public ResponseEntity<List<BestSellerResponse>> getBestSellers(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(productService.getBestSellers(categoryId, limit));
    }
}
