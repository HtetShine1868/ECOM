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

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class AdminService {

    private final OrderRepository orderRepository;
    private final NotificationService notificationService;

    public List<OrderResponse> getAllOrders() {
        return orderRepository.findAllWithUser().stream()
                .map(OrderResponse::from)
                .toList();
    }

    public OrderResponse getOrderById(Long id) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + id));
        return OrderResponse.from(order);
    }

    @Transactional
    public OrderResponse updateOrderStatus(Long id, Order.OrderStatus status) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + id));
        Order.OrderStatus previous = order.getStatus();
        order.setStatus(status);
        order = orderRepository.save(order);
        OrderResponse response = OrderResponse.from(order);
        if (previous != status && order.getUser() != null) {
            Long userId = order.getUser().getId();
            Long savedOrderId = order.getId();
            String statusName = status.name();
            afterCommit(() -> {
                try {
                    notificationService.notifyStatusChange(userId, savedOrderId, statusName);
                } catch (Exception ex) {
                    log.warn("Order {} status saved, but the customer was not notified", savedOrderId, ex);
                }
            });
        }
        return response;
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
