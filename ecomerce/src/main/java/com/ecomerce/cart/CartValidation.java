package com.ecomerce.cart;

/** Pure validation rules for cart quantities. */
public final class CartValidation {

    private CartValidation() {
    }

    public static void requireQuantity(int quantity, int maxQuantityPerItem) {
        if (quantity < 1 || quantity > maxQuantityPerItem) {
            throw new IllegalArgumentException("Quantity must be between 1 and " + maxQuantityPerItem + ".");
        }
    }
}
