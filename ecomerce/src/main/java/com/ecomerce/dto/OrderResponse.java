package com.ecomerce.dto;

import com.ecomerce.entity.Order;
import com.ecomerce.entity.OrderItem;
import com.ecomerce.service.ImageUrls;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Data
@Builder
public class OrderResponse {
    private Long id;
    private String customerName;
    private String customerEmail;
    private String customerPhone;
    private String deliveryAddress;
    private String townName;
    private BigDecimal deliveryFee;
    private BigDecimal subtotal;
    private BigDecimal cargoTotal;
    private BigDecimal total;
    private String status;
    private LocalDateTime orderDate;
    private List<OrderItemResponse> items;

    @Data
    @Builder
    public static class OrderItemResponse {
        private Long id;
        private Long productId;
        private String productName;
        private String productImageUrl;
        private BigDecimal unitPrice;
        private BigDecimal cargoPrice;
        private Integer quantity;
        private BigDecimal lineTotal;
    }

    public static OrderResponse from(Order order) {
        List<OrderItem> sourceItems = order.getOrderItems() == null ? List.of() : order.getOrderItems();
        List<OrderItemResponse> itemResponses = sourceItems.stream()
                .map(item -> OrderItemResponse.builder()
                        .id(item.getId())
                        .productId(item.getProduct() != null ? item.getProduct().getId() : null)
                        .productName(item.getProductName())
                        .productImageUrl(ImageUrls.reachable(item.getProductImageUrl()))
                        .unitPrice(item.getUnitPrice())
                        .cargoPrice(item.getCargoPrice() != null ? item.getCargoPrice() : BigDecimal.ZERO)
                        .quantity(item.getQuantity())
                        .lineTotal(item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
                        .build())
                .collect(Collectors.toList());

        return OrderResponse.builder()
                .id(order.getId())
                .customerName(order.getCustomerName())
                .customerEmail(order.getUser() != null ? order.getUser().getEmail() : "")
                .customerPhone(order.getCustomerPhone())
                .deliveryAddress(order.getDeliveryAddress())
                .townName(order.getTownName())
                .deliveryFee(order.getDeliveryFee() != null ? order.getDeliveryFee() : java.math.BigDecimal.ZERO)
                .subtotal(order.getSubtotal())
                .cargoTotal(order.getCargoTotal() != null ? order.getCargoTotal() : BigDecimal.ZERO)
                .total(order.getTotal())
                .status(order.getStatus().name())
                .orderDate(order.getOrderDate())
                .items(itemResponses)
                .build();
    }
}
