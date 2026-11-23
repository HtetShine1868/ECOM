package com.ecomerce.cart;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * PostgreSQL cart, used when Redis is not enabled. Durable.
 *
 * Quantity changes are single atomic statements (INSERT ... ON CONFLICT DO UPDATE), so two
 * concurrent "add" requests cannot lose an increment. Relies on the unique indexes on
 * carts(user_id) and cart_items(cart_id, product_id) created in schema.sql.
 */
@Component
public class PostgresCartStore implements CartStore {

    @PersistenceContext
    private EntityManager em;

    @Override
    public String name() {
        return "POSTGRES";
    }

    @Override
    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<Line> lines(Long userId) {
        List<Object[]> rows = em.createNativeQuery("""
                        SELECT ci.product_id, ci.quantity, ci.seen_unit_price
                        FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
                        WHERE c.user_id = :userId AND ci.quantity > 0
                        ORDER BY ci.id
                        """)
                .setParameter("userId", userId)
                .getResultList();
        return rows.stream()
                .map(r -> new Line(((Number) r[0]).longValue(), ((Number) r[1]).intValue(),
                        r[2] == null ? null : new BigDecimal(r[2].toString())))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public int quantityOf(Long userId, Long productId) {
        List<?> rows = em.createNativeQuery("""
                        SELECT ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
                        WHERE c.user_id = :userId AND ci.product_id = :productId
                        """)
                .setParameter("userId", userId)
                .setParameter("productId", productId)
                .getResultList();
        return rows.isEmpty() ? 0 : ((Number) rows.get(0)).intValue();
    }

    @Override
    @Transactional
    public int add(Long userId, Long productId, int quantity, int maxQuantity, int maxDistinct, BigDecimal currentPrice) {
        long cartId = cartIdFor(userId);
        if (quantityOf(userId, productId) == 0) {
            Number distinct = (Number) em.createNativeQuery(
                            "SELECT COUNT(*) FROM cart_items WHERE cart_id = :cartId")
                    .setParameter("cartId", cartId)
                    .getSingleResult();
            if (distinct.intValue() >= maxDistinct) {
                return -1;
            }
        }
        Number result = (Number) em.createNativeQuery("""
                        INSERT INTO cart_items (cart_id, product_id, quantity, seen_unit_price)
                        VALUES (:cartId, :productId, LEAST(:qty, :max), :price)
                        ON CONFLICT (cart_id, product_id)
                        DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, :max)
                        RETURNING quantity
                        """)
                .setParameter("cartId", cartId)
                .setParameter("productId", productId)
                .setParameter("qty", quantity)
                .setParameter("max", maxQuantity)
                .setParameter("price", currentPrice)
                .getSingleResult();
        return result.intValue();
    }

    @Override
    @Transactional
    public void setQuantity(Long userId, Long productId, int quantity, BigDecimal currentPriceIfNew) {
        long cartId = cartIdFor(userId);
        em.createNativeQuery("""
                        INSERT INTO cart_items (cart_id, product_id, quantity, seen_unit_price)
                        VALUES (:cartId, :productId, :qty, :price)
                        ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity
                        """)
                .setParameter("cartId", cartId)
                .setParameter("productId", productId)
                .setParameter("qty", quantity)
                .setParameter("price", currentPriceIfNew)
                .executeUpdate();
    }

    @Override
    @Transactional
    public void remove(Long userId, Long productId) {
        removeAll(userId, List.of(productId));
    }

    @Override
    @Transactional
    public void removeAll(Long userId, Collection<Long> productIds) {
        if (productIds.isEmpty()) return;
        em.createNativeQuery("""
                        DELETE FROM cart_items
                        WHERE product_id IN (:ids)
                          AND cart_id IN (SELECT id FROM carts WHERE user_id = :userId)
                        """)
                .setParameter("ids", productIds)
                .setParameter("userId", userId)
                .executeUpdate();
    }

    @Override
    @Transactional
    public void clear(Long userId) {
        em.createNativeQuery("DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = :userId)")
                .setParameter("userId", userId)
                .executeUpdate();
    }

    @Override
    @Transactional
    public void acknowledgePrices(Long userId, Map<Long, BigDecimal> currentPrices) {
        currentPrices.forEach((productId, price) -> em.createNativeQuery("""
                        UPDATE cart_items SET seen_unit_price = :price
                        WHERE product_id = :productId
                          AND cart_id IN (SELECT id FROM carts WHERE user_id = :userId)
                        """)
                .setParameter("price", price)
                .setParameter("productId", productId)
                .setParameter("userId", userId)
                .executeUpdate());
    }

    private long cartIdFor(Long userId) {
        em.createNativeQuery("INSERT INTO carts (user_id) VALUES (:userId) ON CONFLICT (user_id) DO NOTHING")
                .setParameter("userId", userId)
                .executeUpdate();
        Number id = (Number) em.createNativeQuery("SELECT id FROM carts WHERE user_id = :userId")
                .setParameter("userId", userId)
                .getSingleResult();
        return id.longValue();
    }
}
