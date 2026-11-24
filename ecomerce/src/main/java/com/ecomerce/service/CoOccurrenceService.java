package com.ecomerce.service;

import com.ecomerce.entity.Product;
import com.ecomerce.entity.ProductCoOccurrence;
import com.ecomerce.repository.ProductCoOccurrenceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

@Service
@RequiredArgsConstructor
@Slf4j
public class CoOccurrenceService {

    private final ProductCoOccurrenceRepository coOccurrenceRepository;

    @Transactional
    public void recordCoPurchases(Set<Long> productIds) {
        if (productIds == null || productIds.size() < 2) {
            return;
        }

        List<Long> sortedList = new ArrayList<>(new TreeSet<>(productIds));
        for (int i = 0; i < sortedList.size(); i++) {
            for (int j = i + 1; j < sortedList.size(); j++) {
                Long pA = sortedList.get(i);
                Long pB = sortedList.get(j);
                coOccurrenceRepository.incrementCoOccurrence(pA, pB); // atomic upsert
            }
        }
    }

    @Transactional(readOnly = true)
    public List<Long> getFrequentlyBoughtTogetherProductIds(Long productId, int limit) {
        List<ProductCoOccurrence> rows = coOccurrenceRepository.findTopCoPurchased(productId);
        List<Long> result = new ArrayList<>();
        for (ProductCoOccurrence row : rows) {
            Long other = row.getProductAId().equals(productId) ? row.getProductBId() : row.getProductAId();
            if (!result.contains(other)) {
                result.add(other);
            }
            if (result.size() >= limit) break;
        }
        return result;
    }
}
