package com.ecomerce.checkout;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Order totals, computed only from server-side prices. Pure and unit-tested.
 * <pre>
 *   line subtotal = unit price × quantity
 *   subtotal      = Σ line subtotals
 *   cargo total   = Σ cargo price × quantity
 *   total         = subtotal + cargo total + delivery fee
 * </pre>
 */
public final class PricingCalculator {

    private PricingCalculator() {
    }

    public record Line(BigDecimal unitPrice, BigDecimal cargoPrice, int quantity) {
        public BigDecimal lineSubtotal() {
            return money(unitPrice.multiply(BigDecimal.valueOf(quantity)));
        }

        public BigDecimal lineCargo() {
            return money((cargoPrice == null ? BigDecimal.ZERO : cargoPrice).multiply(BigDecimal.valueOf(quantity)));
        }
    }

    public record Totals(BigDecimal subtotal, BigDecimal cargoTotal, BigDecimal deliveryFee, BigDecimal total) {
    }

    public static Totals totals(List<Line> lines, BigDecimal deliveryFee) {
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal cargo = BigDecimal.ZERO;
        for (Line line : lines) {
            if (line.quantity() <= 0) {
                throw new IllegalArgumentException("Quantity must be positive");
            }
            if (line.unitPrice() == null || line.unitPrice().signum() < 0) {
                throw new IllegalArgumentException("Price must be non-negative");
            }
            subtotal = subtotal.add(line.lineSubtotal());
            cargo = cargo.add(line.lineCargo());
        }
        BigDecimal fee = deliveryFee == null ? BigDecimal.ZERO : money(deliveryFee);
        return new Totals(money(subtotal), money(cargo), fee, money(subtotal.add(cargo).add(fee)));
    }

    static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}
