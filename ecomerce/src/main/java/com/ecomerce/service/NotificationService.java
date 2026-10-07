package com.ecomerce.service;

import com.ecomerce.dto.NotificationResponse;
import com.ecomerce.entity.Notification;
import com.ecomerce.entity.User;
import com.ecomerce.exception.ResourceNotFoundException;
import com.ecomerce.repository.NotificationRepository;
import com.ecomerce.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<NotificationResponse> listForUser(Long userId) {
        return notificationRepository.findTop40ByRecipientIdOrderByCreatedAtDesc(userId).stream()
                .map(NotificationResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(Long userId) {
        return notificationRepository.countByRecipientIdAndReadFalse(userId);
    }

    @Transactional
    public void markRead(Long userId, Long notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new ResourceNotFoundException("Notification not found"));
        if (!notification.getRecipient().getId().equals(userId)) {
            throw new ResourceNotFoundException("Notification not found");
        }
        if (!notification.isRead()) {
            notification.setRead(true);
            notificationRepository.save(notification);
        }
    }

    @Transactional
    public void markAllRead(Long userId) {
        notificationRepository.markAllRead(userId);
    }

    /** Runs in its own transaction so a notification failure does not undo the order. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyNewOrder(Long orderId, String customerName, BigDecimal total) {
        List<User> admins = userRepository.findByRole(User.Role.ADMIN);
        if (admins.isEmpty()) {
            return;
        }
        String who = customerName == null || customerName.isBlank() ? "A customer" : customerName.trim();
        String amount = total == null
                ? ""
                : " · " + total.setScale(0, RoundingMode.HALF_UP).toPlainString() + " MMK";
        for (User admin : admins) {
            notificationRepository.save(Notification.builder()
                    .recipient(admin)
                    .type(Notification.Type.NEW_ORDER)
                    .title("New order #" + orderId)
                    .message(who + " placed an order" + amount + ".")
                    .orderId(orderId)
                    .read(false)
                    .build());
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyStatusChange(Long userId, Long orderId, String status) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null || status == null || status.isBlank()) {
            return;
        }
        String label = status.charAt(0) + status.substring(1).toLowerCase().replace('_', ' ');
        notificationRepository.save(Notification.builder()
                .recipient(user)
                .type(Notification.Type.ORDER_STATUS)
                .title("Order #" + orderId + " updated")
                .message("Your order is now " + label + ".")
                .orderId(orderId)
                .read(false)
                .build());
    }

}
