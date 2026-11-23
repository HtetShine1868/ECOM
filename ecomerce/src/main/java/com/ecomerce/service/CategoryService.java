package com.ecomerce.service;

import com.ecomerce.dto.CategoryRequest;
import com.ecomerce.dto.CategoryResponse;
import com.ecomerce.entity.Category;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.CategoryRepository;
import com.ecomerce.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ProductCacheService productCacheService;

    public List<CategoryResponse> getAllCategories() {
        Optional<List<CategoryResponse>> cached = productCacheService.getAllCategories();
        if (cached.isPresent()) {
            return cached.get();
        }

        List<CategoryResponse> list = categoryRepository.findAll().stream()
                .map(CategoryResponse::from)
                .collect(Collectors.toList());
        productCacheService.putAllCategories(list);
        return list;
    }

    public CategoryResponse getCategoryById(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));
        return CategoryResponse.from(category);
    }

    @Transactional
    public CategoryResponse createCategory(CategoryRequest request) {
        if (categoryRepository.existsByNameIgnoreCase(request.getName())) {
            throw new IllegalArgumentException("Category already exists: " + request.getName());
        }
        Category category = Category.builder()
                .name(request.getName().trim())
                .description(request.getDescription())
                .build();
        CategoryResponse response = CategoryResponse.from(categoryRepository.save(category));
        afterCommit(productCacheService::evictCategories);
        return response;
    }

    @Transactional
    public CategoryResponse updateCategory(Long id, CategoryRequest request) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));

        boolean nameConflict = categoryRepository.existsByNameIgnoreCase(request.getName())
                && !category.getName().equalsIgnoreCase(request.getName());
        if (nameConflict) {
            throw new IllegalArgumentException("Category name already taken: " + request.getName());
        }

        category.setName(request.getName().trim());
        category.setDescription(request.getDescription());
        CategoryResponse response = CategoryResponse.from(categoryRepository.save(category));
        afterCommit(productCacheService::evictCategories);
        return response;
    }

    /**
     * Deletes the category and sets category to null for all products that used it.
     */
    @Transactional
    public void deleteCategory(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));

        productRepository.findAll().stream()
                .filter(p -> p.getCategory() != null && p.getCategory().getId().equals(id))
                .forEach(p -> {
                    p.setCategory(null);
                    productRepository.save(p);
                });

        categoryRepository.delete(category);
        afterCommit(productCacheService::evictCategories);
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
