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
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
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
                                             Boolean inStock, Pageable pageable) {
        Specification<Product> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                var category = root.join("category", JoinType.LEFT);
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("description"), "")), like),
                        cb.like(cb.lower(cb.coalesce(category.get("name"), "")), like)
                ));
            }
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("category").get("id"), categoryId));
            }
            if (minPrice != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("price"), minPrice));
            }
            if (maxPrice != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("price"), maxPrice));
            }
            if (Boolean.TRUE.equals(inStock)) {
                predicates.add(cb.greaterThan(root.get("stock"), 0));
            } else if (Boolean.FALSE.equals(inStock)) {
                predicates.add(cb.lessThanOrEqualTo(root.get("stock"), 0));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        return productRepository.findAll(spec, pageable).map(ProductResponse::from);
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
    public List<BestSellerResponse> getBestSellers(Long categoryId, int limit, boolean preferInStock) {
        int fetch = Math.min(Math.max(limit, 1) * (preferInStock ? 5 : 1), 100);
        Pageable pageable = PageRequest.of(0, fetch, Sort.unsorted());
        List<Object[]> rows = categoryId != null
                ? orderItemRepository.findTopSellingProductIdsByCategory(categoryId, pageable)
                : orderItemRepository.findTopSellingProductIds(pageable);

        List<BestSellerResponse> result = new ArrayList<>();
        for (Object[] row : rows) {
            Long productId = ((Number) row[0]).longValue();
            Long totalSold = ((Number) row[1]).longValue();

            productRepository.findById(productId).ifPresent(product ->
                    result.add(toBestSeller(product, totalSold)));
        }

        if (!preferInStock) {
            return result.stream().limit(limit).toList();
        }

        List<BestSellerResponse> ranked = new ArrayList<>();
        result.stream().filter(p -> p.getStock() != null && p.getStock() > 0).forEach(ranked::add);
        result.stream().filter(p -> p.getStock() == null || p.getStock() <= 0).forEach(ranked::add);
        return ranked.stream().limit(limit).toList();
    }

    /**
     * Same category first, then a similar price band. Ordered by the
     * backend popularity score. Out-of-stock items stay at the end.
     */
    public List<ProductResponse> getRelatedProducts(Long id, int limit) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
        int safeLimit = Math.min(Math.max(limit, 1), 12);
        Long categoryId = product.getCategory() != null ? product.getCategory().getId() : null;
        BigDecimal price = product.getPrice() == null ? BigDecimal.ZERO : product.getPrice();
        BigDecimal low = price.multiply(new BigDecimal("0.6"));
        BigDecimal high = price.multiply(new BigDecimal("1.4"));

        Specification<Product> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.notEqual(root.get("id"), id));
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("category").get("id"), categoryId));
            } else {
                predicates.add(cb.between(root.get("price"), low, high));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Sort sort = Sort.by(Sort.Order.desc("popularityScore"), Sort.Order.desc("stock"));
        List<ProductResponse> related = productRepository
                .findAll(spec, PageRequest.of(0, safeLimit, sort))
                .map(ProductResponse::from)
                .getContent();

        if (!related.isEmpty() || categoryId == null) {
            return related;
        }

        Specification<Product> priceBand = (root, query, cb) -> cb.and(
                cb.notEqual(root.get("id"), id),
                cb.between(root.get("price"), low, high)
        );
        return productRepository.findAll(priceBand, PageRequest.of(0, safeLimit, sort))
                .map(ProductResponse::from)
                .getContent();
    }

    private BestSellerResponse toBestSeller(Product product, Long totalSold) {
        return BestSellerResponse.builder()
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
                .build();
    }

    // ---- helpers ----

    private Category resolveCategory(Long categoryId) {
        if (categoryId == null) return null;
        return categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + categoryId));
    }
}
