package com.ecomerce.security;

import com.ecomerce.dto.OrderRequest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlInjectionGuardTest {

    @Test
    void allowsOrdinaryShopText() {
        assertFalse(SqlInjectionGuard.isUnsafe("No. 12, Yadanar Street"));
        assertFalse(SqlInjectionGuard.isUnsafe("Wireless Headphones"));
        assertFalse(SqlInjectionGuard.isUnsafe("how do I delete my order"));
        assertFalse(SqlInjectionGuard.isUnsafe("+959123456789"));
    }

    @Test
    void rejectsSqlPayloads() {
        assertTrue(SqlInjectionGuard.isUnsafe("' OR '1'='1"));
        assertTrue(SqlInjectionGuard.isUnsafe("admin'--"));
        assertTrue(SqlInjectionGuard.isUnsafe("1; DROP TABLE orders"));
        assertTrue(SqlInjectionGuard.isUnsafe("UNION SELECT password FROM users"));
        assertTrue(SqlInjectionGuard.isUnsafe("a\0b"));
    }

    @Test
    void checksEveryStringOnAnOrder() {
        OrderRequest safe = new OrderRequest();
        safe.setCustomerName("Aye Aye");
        safe.setCustomerPhone("+959123456789");
        safe.setCustomDeliveryAddress("No. 12, Yadanar Street");
        assertDoesNotThrow(() -> SqlInjectionGuard.assertSafeObject(safe));

        OrderRequest unsafe = new OrderRequest();
        unsafe.setCustomerName("Aye Aye");
        unsafe.setCustomerPhone("+959123456789");
        unsafe.setCustomDeliveryAddress("12 Street'; DROP TABLE orders; --");
        assertThrows(IllegalArgumentException.class, () -> SqlInjectionGuard.assertSafeObject(unsafe));
    }
}
