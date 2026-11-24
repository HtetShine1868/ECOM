package com.ecomerce.entity;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.OffsetDateTime;

@Entity
@Table(name = "product_co_occurrences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@IdClass(ProductCoOccurrence.CoOccurrenceId.class)
public class ProductCoOccurrence {

    @Id
    @Column(name = "product_a_id")
    private Long productAId;

    @Id
    @Column(name = "product_b_id")
    private Long productBId;

    @Column(nullable = false)
    @Builder.Default
    private Integer coPurchaseCount = 1;

    @Builder.Default
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CoOccurrenceId implements Serializable {
        private Long productAId;
        private Long productBId;
    }
}
