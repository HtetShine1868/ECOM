package com.ecomerce.service;

import com.ecomerce.dto.BestSellerResponse;
import com.ecomerce.dto.ProductRequest;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.Category;
import com.ecomerce.entity.Product;
import com.ecomerce.exception.OptimisticLockConflictException;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.CategoryRepository;
import com.ecomerce.repository.OrderItemRepository;
import com.ecomerce.repository.ProductRepository;
import com.ecomerce.security.SqlInjectionGuard;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final OrderItemRepository orderItemRepository;
    private final com.ecomerce.repository.CartItemRepository cartItemRepository;
    private final StorageService storageService;
    private final ProductCacheService productCacheService;
    private final AuditService auditService;
    private final RatingEnricher ratingEnricher;

    /**
     * Returns a filtered, paginated list of products.
     * All filter params are optional — pass null to skip.
     * By default only active products are returned unless showInactive=true.
     */
    public Page<ProductResponse> getProducts(String search, Long categoryId,
                                             BigDecimal minPrice, BigDecimal maxPrice,
                                             Boolean inStock, Pageable pageable) {
        Specification<Product> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Only show active products to customers
            predicates.add(cb.equal(root.get("active"), true));

            if (search != null && !search.isBlank()) {
                SqlInjectionGuard.assertSafe(search);
                String like = likePattern(search);
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.get("description"), "")), like, '\\')
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
        Page<ProductResponse> page = productRepository.findAll(spec, pageable).map(ProductResponse::from);
        ratingEnricher.enrichAll(page.getContent());
        return page;
    }

    /**
     * Admin version — returns all products including inactive.
     */
    public Page<ProductResponse> getProductsAdmin(String search, Long categoryId,
                                                   BigDecimal minPrice, BigDecimal maxPrice,
                                                   Boolean inStock, Pageable pageable) {
        Specification<Product> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                SqlInjectionGuard.assertSafe(search);
                String like = likePattern(search);
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.get("description"), "")), like, '\\')
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
        Optional<ProductResponse> cached = productCacheService.getProduct(id);
        if (cached.isPresent()) {
            return cached.get();
        }

        Product product = productRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.product(id));
        ProductResponse response = ratingEnricher.enrich(ProductResponse.from(product));
        productCacheService.putProduct(response);
        return response;
    }

    /** Uncached read straight from PostgreSQL, for admin flows that act on the current row. */
    public ProductResponse getProductFresh(Long id) {
        return ProductResponse.from(productRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.product(id)));
    }

    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        Category category = resolveCategory(request.getCategoryId());
        Product product = Product.builder()
                .name(request.getName().trim())
                .description(request.getDescription())
                .price(request.getPrice())
                .stock(request.getStock())
                .cargoPrice(request.getCargoPrice())
                .category(category)
                .active(request.getActive() != null ? request.getActive() : true)
                .build();
        Product saved = productRepository.saveAndFlush(product);
        ProductResponse response = ProductResponse.from(saved);

        auditService.logAction("PRODUCT", String.valueOf(saved.getId()), "CREATE", null, auditView(saved));
        afterCommit(productCacheService::evictListings);
        return response;
    }

    /**
     * Update with optimistic locking. The admin must send the version they edited. If the
     * row changed since (another admin saved, or a purchase changed the stock), the update is
     * rejected with PRODUCT_MODIFIED_BY_ANOTHER_USER and the current values, never merged.
     */
    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        if (request.getVersion() == null) {
            throw new IllegalArgumentException("Reload the product before saving (missing version).");
        }
        Product product = productRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.product(id));

        if (!request.getVersion().equals(product.getVersion())) {
            throw new OptimisticLockConflictException(
                    "This product changed since you opened it (another admin saved it, or a customer bought some). "
                            + "Review the latest values and save again.",
                    ProductResponse.from(product));
        }

        Map<String, Object> before = auditView(product);
        int oldStock = product.getStock() == null ? 0 : product.getStock();

        product.setName(request.getName().trim());
        product.setDescription(request.getDescription());
        product.setPrice(request.getPrice());
        product.setStock(request.getStock());
        product.setCargoPrice(request.getCargoPrice());
        product.setCategory(resolveCategory(request.getCategoryId()));
        if (request.getActive() != null) {
            product.setActive(request.getActive());
        }

        // Flush now so a concurrent commit between our read and write surfaces here as a
        // version conflict (JPA @Version check), inside this transaction.
        Product saved = productRepository.saveAndFlush(product);
        Map<String, Object> after = auditView(saved);

        auditService.logAction("PRODUCT", String.valueOf(id), "UPDATE", before, after);
        if (oldStock != saved.getStock()) {
            auditService.logAction("PRODUCT", String.valueOf(id), "STOCK_CHANGE",
                    Map.of("stock", oldStock), Map.of("stock", saved.getStock(), "delta", saved.getStock() - oldStock));
        }

        afterCommit(() -> productCacheService.evictProduct(id));
        return ProductResponse.from(saved);
    }

    @Transactional
    public ProductResponse updateProductImage(Long id, String imageUrl) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.product(id));
        String oldUrl = product.getImageUrl();
        product.setImageUrl(imageUrl);
        Product saved = productRepository.saveAndFlush(product);

        auditService.logAction("PRODUCT", String.valueOf(id), "IMAGE_UPDATE",
                Map.of("imageUrl", oldUrl == null ? "" : oldUrl), Map.of("imageUrl", imageUrl));
        afterCommit(() -> productCacheService.evictProduct(id));
        return ProductResponse.from(saved);
    }

    /**
     * Products that appear in any order are only deactivated (soft delete), so historical
     * order items keep their product reference. Never-ordered products are hard-deleted.
     */
    @Transactional
    public void deleteProduct(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.product(id));

        Map<String, Object> before = auditView(product);
        if (orderItemRepository.existsByProductId(id)) {
            product.setActive(false);
            productRepository.saveAndFlush(product);
            auditService.logAction("PRODUCT", String.valueOf(id), "SOFT_DELETE", before, Map.of("active", false));
            afterCommit(() -> productCacheService.evictProduct(id));
        } else {
            String imageUrl = product.getImageUrl();
            cartItemRepository.deleteAllByProductId(id); // DB carts reference products by FK
            productRepository.delete(product);
            productRepository.flush();
            auditService.logAction("PRODUCT", String.valueOf(id), "HARD_DELETE", before, null);
            afterCommit(() -> {
                productCacheService.evictProduct(id);
                storageService.deleteProductImage(imageUrl); // only once the row is really gone
            });
        }
    }

    /**
     * Returns best-selling products ranked by total quantity sold across all orders.
     * Filters by categoryId if provided. Results limited to the given limit.
     */
    public List<BestSellerResponse> getBestSellers(Long categoryId, int limit, boolean preferInStock) {
        int safeLimit = Math.min(Math.max(limit, 1), 24);
        if (!preferInStock) {
            return loadBestSellers(categoryId, safeLimit, false); // admin view: always fresh
        }
        Optional<List<BestSellerResponse>> cached = productCacheService.getPopular(categoryId, safeLimit);
        if (cached.isPresent()) {
            return cached.get();
        }
        List<BestSellerResponse> fresh = loadBestSellers(categoryId, safeLimit, true);
        productCacheService.putPopular(categoryId, safeLimit, fresh);
        return fresh;
    }

    private List<BestSellerResponse> loadBestSellers(Long categoryId, int limit, boolean preferInStock) {
        int fetch = Math.min(Math.max(limit, 1) * (preferInStock ? 5 : 1), 100);
        Pageable pageable = PageRequest.of(0, fetch, Sort.unsorted());
        List<Object[]> rows = categoryId != null
                ? orderItemRepository.findTopSellingProductIdsByCategory(categoryId, pageable)
                : orderItemRepository.findTopSellingProductIds(pageable);

        List<BestSellerResponse> result = new ArrayList<>();
        for (Object[] row : rows) {
            Long productId = ((Number) row[0]).longValue();
            Long totalSold = ((Number) row[1]).longValue();

            // Deleted (deactivated) products keep their sales history but must never be shown to shoppers.
            productRepository.findById(productId)
                    .filter(product -> !preferInStock || Boolean.TRUE.equals(product.getActive()))
                    .ifPresent(product -> result.add(toBestSeller(product, totalSold)));
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
     * Only active products are returned.
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
            predicates.add(cb.equal(root.get("active"), true));
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("category").get("id"), categoryId));
            } else {
                predicates.add(cb.between(root.get("price"), low, high));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Sort sort = Sort.by(
                Sort.Order.desc("inStockRank"),
                Sort.Order.desc("popularityScore"),
                Sort.Order.desc("createdAt"));
        List<ProductResponse> related = productRepository
                .findAll(spec, PageRequest.of(0, safeLimit, sort))
                .map(ProductResponse::from)
                .getContent();

        if (!related.isEmpty() || categoryId == null) {
            return related;
        }

        Specification<Product> priceBand = (root, query, cb) -> cb.and(
                cb.notEqual(root.get("id"), id),
                cb.equal(root.get("active"), true),
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
                .imageUrl(ImageUrls.reachable(product.getImageUrl()))
                .categoryId(product.getCategory() != null ? product.getCategory().getId() : null)
                .categoryName(product.getCategory() != null ? product.getCategory().getName() : null)
                .totalSold(totalSold)
                .createdAt(product.getCreatedAt())
                .build();
    }

    // ---- helpers ----

    private static String likePattern(String search) {
        String escaped = search.trim().toLowerCase()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static Map<String, Object> auditView(Product p) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("name", p.getName());
        view.put("price", p.getPrice());
        view.put("cargoPrice", p.getCargoPrice());
        view.put("stock", p.getStock());
        view.put("active", p.getActive());
        view.put("categoryId", p.getCategory() != null ? p.getCategory().getId() : null);
        view.put("version", p.getVersion());
        return view;
    }

    private Category resolveCategory(Long categoryId) {
        if (categoryId == null) return null;
        return categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + categoryId));
    }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }
}
