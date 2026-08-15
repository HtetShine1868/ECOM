package com.ecomerce.service;

import com.ecomerce.dto.ProductRequest;
import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.Product;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final StorageService storageService;

    public Page<ProductResponse> getProducts(String search, Pageable pageable) {
        if (search != null && !search.isBlank()) {
            return productRepository.findByNameContainingIgnoreCase(search, pageable)
                    .map(ProductResponse::from);
        }
        return productRepository.findAll(pageable).map(ProductResponse::from);
    }

    public ProductResponse getProductById(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
        return ProductResponse.from(product);
    }

    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        Product product = Product.builder()
                .name(request.getName())
                .description(request.getDescription())
                .price(request.getPrice())
                .stock(request.getStock())
                .cargoPrice(request.getCargoPrice())
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
}
