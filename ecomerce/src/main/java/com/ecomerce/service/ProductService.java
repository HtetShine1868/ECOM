package com.ecomerce.service;

import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.ProductRequest;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.Category;
import com.ecomerce.entity.Product;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.CategoryRepository;
import com.ecomerce.repository.OrderItemRepository;
import com.ecomerce.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final OrderItemRepository orderItemRepository;
    private final StorageService storageService;

    /**
     * Returns a filtered, paginated list of products.
     * All filter params are optional — pass null to skip.
     */
    public Page<ProductResponse> getProducts(String search, Long categoryId,
                                             BigDecimal minPrice, BigDecimal maxPrice,
                                             Pageable pageable) {
        return productRepository
                .findWithFilters(
                        (search != null && !search.isBlank()) ? search : null,
                        categoryId,
                        minPrice,
                        maxPrice,
                        pageable
                )
                .map(ProductResponse::from);
    }

    public ProductResponse getProductById(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
        return ProductResponse.from(product);
    }

    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        Category category = resolveCategory(request.getCategoryId());
        Product product = Product.builder()
                .name(request.getName())
                .description(request.getDescription())
                .price(request.getPrice())
                .stock(request.getStock())
                .cargoPrice(request.getCargoPrice())
                .category(category)
                .build();
        return ProductResponse.from(productRepository.save(product));
    }

    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));

        product.setName(request.getName());
        product.setDescription(request.getDescription());
        product.setPrice(request.getPrice());
        product.setStock(request.getStock());
        product.setCargoPrice(request.getCargoPrice());
        product.setCategory(resolveCategory(request.getCategoryId()));

        return ProductResponse.from(productRepository.save(product));
    }

    @Transactional
    public ProductResponse updateProductImage(Long id, String imageUrl) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
        product.setImageUrl(imageUrl);
        return ProductResponse.from(productRepository.save(product));
    }

    /**
     * Deletes a product from PostgreSQL and removes its image from Supabase Storage.
     *
     * Order of operations:
     *   1. Capture the current imageUrl before deletion.
     *   2. Delete the product from the database (cascades to nothing — OrderItems hold
     *      their own productName/unitPrice/productImageUrl snapshots, preserving order history).
     *   3. Delete the image from Supabase Storage (failure is logged, not re-thrown).
     */
    @Transactional
    public void deleteProduct(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));

        String imageUrl = product.getImageUrl();

        productRepository.delete(product);

        // Clean up the image from Supabase Storage after the DB record is gone.
        // StorageService.deleteProductImage() swallows errors, so this never blocks deletion.
        storageService.deleteProductImage(imageUrl);
    }

    /**
     * Returns best-selling products ranked by total quantity sold across all orders.
     * Filters by categoryId if provided. Results limited to the given limit.
     */
    public List<BestSellerResponse> getBestSellers(Long categoryId, int limit) {
        Pageable pageable = PageRequest.of(0, limit, Sort.unsorted());
        List<Object[]> rows = orderItemRepository.findTopSellingProductIds(categoryId, pageable);

        List<BestSellerResponse> result = new ArrayList<>();
        for (Object[] row : rows) {
            Long productId = (Long) row[0];
            Long totalSold = (Long) row[1];

            productRepository.findById(productId).ifPresent(product -> {
                result.add(BestSellerResponse.builder()
                        .productId(product.getId())
                        .name(product.getName())
                        .description(product.getDescription())
                        .price(product.getPrice())
                        .stock(product.getStock())
                        .cargoPrice(product.getCargoPrice())
                        .imageUrl(product.getImageUrl())
                        .categoryId(product.getCategory() != null ? product.getCategory().getId() : null)
                        .categoryName(product.getCategory() != null ? product.getCategory().getName() : null)
                        .totalSold(totalSold)
                        .createdAt(product.getCreatedAt())
                        .build());
            });
        }
        return result;
    }

    // ---- helpers ----

    private Category resolveCategory(Long categoryId) {
        if (categoryId == null) return null;
        return categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + categoryId));
    }
}
