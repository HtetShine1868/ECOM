package com.ecomerce.service;

import com.ecomerce.dto.ProductResponse;
import com.ecomerce.entity.ProductRatingSummary;
import com.ecomerce.repository.ProductRatingSummaryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Adds the average rating and review count to product responses with one query. */
@Component
@RequiredArgsConstructor
public class RatingEnricher {

    private final ProductRatingSummaryRepository summaries;

    public <T extends Collection<ProductResponse>> T enrichAll(T products) {
        if (products == null || products.isEmpty()) return products;
        List<Long> ids = products.stream().map(ProductResponse::getId).filter(java.util.Objects::nonNull).distinct().toList();
        Map<Long, ProductRatingSummary> byId = summaries.findAllById(ids).stream()
                .collect(Collectors.toMap(ProductRatingSummary::getProductId, s -> s));
        for (ProductResponse p : products) {
            ProductRatingSummary s = byId.get(p.getId());
            p.setAverageRating(s == null || s.getAverageRating() == null ? 0.0 : s.getAverageRating().doubleValue());
            p.setTotalReviews(s == null || s.getTotalReviews() == null ? 0 : s.getTotalReviews());
        }
        return products;
    }

    public ProductResponse enrich(ProductResponse product) {
        if (product != null) enrichAll(List.of(product));
        return product;
    }
}
