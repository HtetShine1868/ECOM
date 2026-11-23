package com.ecomerce.service;

import com.ecomerce.dto.ProductRequest;
import com.ecomerce.entity.Product;
import com.ecomerce.exception.OptimisticLockConflictException;
import com.ecomerce.repository.CategoryRepository;
import com.ecomerce.repository.OrderItemRepository;
import com.ecomerce.repository.ProductRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductOptimisticLockingTest {

    @Mock
    private ProductRepository productRepository;
    @Mock
    private CategoryRepository categoryRepository;
    @Mock
    private OrderItemRepository orderItemRepository;
    @Mock
    private StorageService storageService;
    @Mock
    private ProductCacheService productCacheService;
    @Mock
    private AuditService auditService;

    @InjectMocks
    private ProductService productService;

    @Test
    void updateProduct_shouldThrowOptimisticLockConflict_whenVersionDoesNotMatch() {
        Product currentInDb = Product.builder()
                .id(1L)
                .name("Camera")
                .price(BigDecimal.valueOf(100))
                .stock(5)
                .version(5L) // Version in DB has moved to 5
                .active(true)
                .build();

        when(productRepository.findById(1L)).thenReturn(Optional.of(currentInDb));

        ProductRequest staleRequest = new ProductRequest();
        staleRequest.setName("Camera Pro");
        staleRequest.setPrice(BigDecimal.valueOf(120));
        staleRequest.setStock(5);
        staleRequest.setCargoPrice(BigDecimal.ZERO);
        staleRequest.setVersion(4L); // Admin submits version 4 (stale)

        assertThrows(OptimisticLockConflictException.class, () ->
                productService.updateProduct(1L, staleRequest)
        );
    }
}
