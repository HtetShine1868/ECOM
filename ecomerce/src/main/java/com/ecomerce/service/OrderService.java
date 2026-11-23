package com.ecomerce.service;

import com.ecomerce.dto.OrderResponse;
import com.ecomerce.entity.Order;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.stream.Collectors;

/** Order queries and admin status changes. Order creation lives in CheckoutService. */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class OrderService {

    private final OrderRepository orderRepository;
    private final NotificationService notificationService;
    private final AuditService auditService;

    public List<OrderResponse> getMyOrders(Long userId) {
        return orderRepository.findByUserIdOrderByOrderDateDesc(userId).stream()
                .map(OrderResponse::from)
                .collect(Collectors.toList());
    }

    public OrderResponse getOrderById(Long orderId, Long userId, boolean isAdmin) {
        if (isAdmin) {
            Order order = orderRepository.findById(orderId)
                    .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));
            return OrderResponse.from(order);
        }

        Order order = orderRepository.findByIdAndUserId(orderId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found or access denied"));
        return OrderResponse.from(order);
    }

    public List<OrderResponse> getAllOrders() {
        return orderRepository.findAllWithUser().stream()
                .map(OrderResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public OrderResponse updateOrderStatus(Long orderId, Order.OrderStatus newStatus) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));
        Order.OrderStatus previous = order.getStatus();
        order.setStatus(newStatus);
        order = orderRepository.save(order);
        if (previous != newStatus) {
            auditService.logAction("ORDER", String.valueOf(orderId), "STATUS_CHANGE",
                    java.util.Map.of("status", previous.name()), java.util.Map.of("status", newStatus.name()));
        }
        if (previous != newStatus && order.getUser() != null) {
            Long userNotifyId = order.getUser().getId();
            Long savedOrderId = order.getId();
            String statusName = newStatus.name();
            afterCommit(() -> {
                try {
                    notificationService.notifyStatusChange(userNotifyId, savedOrderId, statusName);
                } catch (Exception ex) {
                    log.warn("Order {} status saved, but the customer was not notified", savedOrderId, ex);
                }
            });
        }
        return OrderResponse.from(order);
    }

    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }
}
