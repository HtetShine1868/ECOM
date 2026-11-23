package com.ecomerce.cart;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Storage for cart lines: product ID, quantity, and the price the customer last reviewed.
 *
 * A cart store never touches product stock and never holds an authoritative price.
 * The "seen price" is only used to tell the customer that a price changed.
 */
public interface CartStore {

    /** A stored cart line. {@code seenPrice} may be null. */
    record Line(Long productId, int quantity, BigDecimal seenPrice) {
    }

    String name();

    List<Line> lines(Long userId);

    /** Current quantity for one product, or 0. */
    int quantityOf(Long userId, Long productId);

    /**
     * Atomically add {@code quantity} (capped at {@code maxQuantity}). Records {@code currentPrice}
     * as the seen price only if none is recorded yet.
     *
     * @return the new quantity, or -1 if the cart already holds {@code maxDistinct} other products
     */
    int add(Long userId, Long productId, int quantity, int maxQuantity, int maxDistinct, BigDecimal currentPrice);

    void setQuantity(Long userId, Long productId, int quantity, BigDecimal currentPriceIfNew);

    void remove(Long userId, Long productId);

    void removeAll(Long userId, Collection<Long> productIds);

    void clear(Long userId);

    /** Record that the customer has reviewed these prices. */
    void acknowledgePrices(Long userId, Map<Long, BigDecimal> currentPrices);
}
