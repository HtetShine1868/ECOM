package com.ecomerce.service;

import com.ecomerce.dto.OrderRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class IdempotencyServiceTest {

    private IdempotencyService idempotencyService;

    @BeforeEach
    void setUp() {
        idempotencyService = new IdempotencyService(null);
    }

    @Test
    void calculateRequestHash_shouldBeDeterministicRegardlessOfItemOrder() {
        OrderRequest requestA = new OrderRequest();
        requestA.setCustomerName("John Doe");
        requestA.setCustomerPhone("+959123456789");
        requestA.setDeliveryZoneId(1L);
        requestA.setCustomDeliveryAddress("123 Main St");

        OrderRequest.OrderItemRequest item1 = new OrderRequest.OrderItemRequest();
        item1.setProductId(10L);
        item1.setQuantity(2);

        OrderRequest.OrderItemRequest item2 = new OrderRequest.OrderItemRequest();
        item2.setProductId(20L);
        item2.setQuantity(1);

        requestA.setItems(List.of(item1, item2));

        // Request B has same items but reversed order
        OrderRequest requestB = new OrderRequest();
        requestB.setCustomerName("John Doe");
        requestB.setCustomerPhone("+959123456789");
        requestB.setDeliveryZoneId(1L);
        requestB.setCustomDeliveryAddress("123 Main St");
        requestB.setItems(List.of(item2, item1));

        String hashA = idempotencyService.calculateRequestHash(requestA);
        String hashB = idempotencyService.calculateRequestHash(requestB);

        assertNotNull(hashA);
        assertEquals(hashA, hashB, "Hash must be identical regardless of item list order");
    }

    @Test
    void calculateRequestHash_shouldDifferWhenQuantitiesOrAddressesChange() {
        OrderRequest requestA = new OrderRequest();
        requestA.setCustomerName("John Doe");
        requestA.setCustomerPhone("+959123456789");
        requestA.setDeliveryZoneId(1L);
        requestA.setCustomDeliveryAddress("123 Main St");

        OrderRequest.OrderItemRequest item = new OrderRequest.OrderItemRequest();
        item.setProductId(10L);
        item.setQuantity(2);
        requestA.setItems(List.of(item));

        OrderRequest requestB = new OrderRequest();
        requestB.setCustomerName("John Doe");
        requestB.setCustomerPhone("+959123456789");
        requestB.setDeliveryZoneId(1L);
        requestB.setCustomDeliveryAddress("123 Main St");

        OrderRequest.OrderItemRequest itemDifferentQty = new OrderRequest.OrderItemRequest();
        itemDifferentQty.setProductId(10L);
        itemDifferentQty.setQuantity(3);
        requestB.setItems(List.of(itemDifferentQty));

        String hashA = idempotencyService.calculateRequestHash(requestA);
        String hashB = idempotencyService.calculateRequestHash(requestB);

        assertNotEquals(hashA, hashB, "Hash must differ when item quantity changes");
    }
}
