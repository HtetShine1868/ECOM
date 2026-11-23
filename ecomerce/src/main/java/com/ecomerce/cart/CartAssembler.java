package com.ecomerce.cart;

import com.ecomerce.dto.CartResponse;
import com.ecomerce.entity.Product;
import com.ecomerce.service.ImageUrls;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Builds the cart response from stored lines plus current PostgreSQL product rows.
 * Pure function: no I/O, so the reconciliation rules are unit-tested directly.
 */
public final class CartAssembler {

    private CartAssembler() {
    }

    public static CartResponse assemble(String storage, List<CartStore.Line> lines, Map<Long, Product> products) {
        List<CartResponse.CartItemResponse> items = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal cargoTotal = BigDecimal.ZERO;
        boolean anyPriceChange = false;
        boolean anyUnavailable = false;
        int totalItems = 0;

        for (CartStore.Line line : lines) {
            Product product = products.get(line.productId());
            int qty = line.quantity();
            totalItems += qty;

            if (product == null) {
                anyUnavailable = true;
                items.add(CartResponse.CartItemResponse.builder()
                        .cartItemId(line.productId())
                        .productId(line.productId())
                        .productName("This product was removed from the shop")
                        .quantity(qty)
                        .unitPrice(BigDecimal.ZERO)
                        .cargoPrice(BigDecimal.ZERO)
                        .lineTotal(BigDecimal.ZERO)
                        .availableStock(0)
                        .available(false)
                        .active(false)
                        .availability("REMOVED")
                        .priceChanged(false)
                        .previousPrice(line.seenPrice())
                        .build());
                continue;
            }

            boolean active = Boolean.TRUE.equals(product.getActive());
            int stock = product.getStock() == null ? 0 : product.getStock();
            String availability = !active ? "INACTIVE"
                    : stock <= 0 ? "OUT_OF_STOCK"
                    : stock < qty ? "INSUFFICIENT_STOCK"
                    : "IN_STOCK";
            boolean available = "IN_STOCK".equals(availability);
            BigDecimal price = product.getPrice();
            BigDecimal cargo = product.getCargoPrice() == null ? BigDecimal.ZERO : product.getCargoPrice();
            boolean priceChanged = line.seenPrice() != null && line.seenPrice().compareTo(price) != 0;

            BigDecimal lineTotal = price.multiply(BigDecimal.valueOf(qty));
            if (available) {
                subtotal = subtotal.add(lineTotal);
                cargoTotal = cargoTotal.add(cargo.multiply(BigDecimal.valueOf(qty)));
            } else {
                anyUnavailable = true;
            }
            anyPriceChange |= priceChanged;

            items.add(CartResponse.CartItemResponse.builder()
                    .cartItemId(product.getId())
                    .productId(product.getId())
                    .productName(product.getName())
                    .productImageUrl(ImageUrls.reachable(product.getImageUrl()))
                    .unitPrice(price)
                    .cargoPrice(cargo)
                    .quantity(qty)
                    .lineTotal(lineTotal)
                    .availableStock(Math.max(stock, 0))
                    .available(available)
                    .active(active)
                    .availability(availability)
                    .priceChanged(priceChanged)
                    .previousPrice(line.seenPrice())
                    .build());
        }

        return CartResponse.builder()
                .items(items)
                .totalItems(totalItems)
                .subtotal(subtotal)
                .cargoTotal(cargoTotal)
                .total(subtotal.add(cargoTotal))
                .storage(storage)
                .hasPriceChanges(anyPriceChange)
                .hasUnavailableItems(anyUnavailable)
                .build();
    }
}
