package com.ecomerce.service;

import com.ecomerce.dto.OrderRequest;
import com.ecomerce.entity.IdempotencyRecord;
import com.ecomerce.exception.CheckoutInProgressException;
import com.ecomerce.exception.IdempotencyKeyReusedException;
import com.ecomerce.repository.IdempotencyRecordRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/**
 * Checkout idempotency, backed by the idempotency_records table (never memory or Redis).
 *
 * Lifecycle of one key:
 * <pre>
 *   (none) --claim--> PROCESSING --order tx commits--> SUCCEEDED   (same tx as the order)
 *                         |
 *                         +--order tx fails--> FAILED --same request retried--> PROCESSING
 * </pre>
 * A PROCESSING record older than {@code app.idempotency.processing-timeout-seconds} is treated
 * as abandoned and may be reclaimed. Even then, the UNIQUE orders.idempotency_key index makes a
 * second order for the same key impossible.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IdempotencyService {

    /** Result of a claim: either this request owns the key, or the key already has an order. */
    public record Claim(boolean owned, Long existingOrderId) {
        static Claim ownedClaim() {
            return new Claim(true, null);
        }

        static Claim completedClaim(Long orderId) {
            return new Claim(false, orderId);
        }
    }

    private final IdempotencyRecordRepository repository;

    @Value("${app.idempotency.processing-timeout-seconds:120}")
    private long processingTimeoutSeconds = 120;

    /**
     * Deterministic SHA-256 of the business content of a checkout request. Items are merged
     * per product and sorted, and text is trimmed, so the same cart always hashes the same.
     * Expected prices are deliberately excluded: they are a confirmation signal, not the order.
     */
    public String calculateRequestHash(OrderRequest request) {
        StringBuilder sb = new StringBuilder("v1|");
        sb.append("customer:").append(trim(request.getCustomerName())).append('|');
        sb.append("phone:").append(trim(request.getCustomerPhone())).append('|');
        sb.append("zone:").append(request.getDeliveryZoneId()).append('|');
        sb.append("address:").append(trim(request.getCustomDeliveryAddress())).append('|');

        List<OrderRequest.OrderItemRequest> items = request.getItems() == null ? List.of() : request.getItems();
        items.stream()
                .filter(i -> i.getProductId() != null)
                .collect(java.util.stream.Collectors.groupingBy(
                        OrderRequest.OrderItemRequest::getProductId,
                        java.util.TreeMap::new,
                        java.util.stream.Collectors.summingInt(i -> i.getQuantity() == null ? 0 : i.getQuantity())))
                .forEach((productId, qty) -> sb.append("item:").append(productId).append(':').append(qty).append(';'));

        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    /**
     * Claim the key in its own committed transaction, before any stock is touched.
     *
     * @throws IdempotencyKeyReusedException the key was used for a different request
     * @throws CheckoutInProgressException   another request with this key is running
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Claim claim(Long userId, String key, String requestHash) {
        if (repository.insertIfAbsent(userId, key, requestHash) == 1) {
            return Claim.ownedClaim();
        }

        IdempotencyRecord record = repository.findByUserIdAndIdempotencyKey(userId, key)
                .orElseThrow(() -> new CheckoutInProgressException(
                        "This checkout is being processed. Please wait a moment."));

        if (!record.getRequestHash().equals(requestHash)) {
            throw new IdempotencyKeyReusedException(
                    "This checkout key was already used for a different order. Please start checkout again.");
        }

        return switch (record.getStatus()) {
            case SUCCEEDED -> {
                log.info("Idempotent replay: returning order {} for user {}", record.getOrderId(), userId);
                yield Claim.completedClaim(record.getOrderId());
            }
            case FAILED -> {
                if (repository.reclaimFailed(record.getId()) == 1) yield Claim.ownedClaim();
                throw inProgress();
            }
            case PROCESSING -> {
                if (repository.reclaimStale(record.getId(), processingTimeoutSeconds) == 1) {
                    log.warn("Reclaiming abandoned checkout key for user {}", userId);
                    yield Claim.ownedClaim();
                }
                throw inProgress();
            }
        };
    }

    /** Must be called inside the order transaction. Returns false if the claim was lost. */
    public boolean markSucceededInCurrentTransaction(Long userId, String key, Long orderId) {
        return repository.markSucceeded(userId, key, orderId) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long userId, String key) {
        repository.markFailed(userId, key);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markSucceeded(Long userId, String key, Long orderId) {
        repository.markSucceeded(userId, key, orderId);
    }

    private static CheckoutInProgressException inProgress() {
        return new CheckoutInProgressException("This checkout is already being processed. Please wait a moment.");
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
