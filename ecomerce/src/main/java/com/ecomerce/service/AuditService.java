package com.ecomerce.service;

import com.ecomerce.entity.AuditLog;
import com.ecomerce.repository.AuditLogRepository;
import com.ecomerce.repository.UserRepository;
import com.ecomerce.security.CurrentUser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin audit history.
 *
 * The entry is written in the SAME transaction as the change it describes (MANDATORY), so
 * the history can never show a change that was rolled back, and a committed change always
 * has its entry. The actor is taken from the security context, never from the request body.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.MANDATORY)
    public void logAction(String entityType, String entityId, String action, Object oldValues, Object newValues) {
        String email = CurrentUser.currentEmail().orElse(null);
        Long userId = email == null ? null : userRepository.findByEmail(email).map(u -> u.getId()).orElse(null);

        auditLogRepository.save(AuditLog.builder()
                .entityType(entityType)
                .entityId(entityId)
                .action(action)
                .changedByUserId(userId)
                .changedByEmail(email)
                .oldValues(toJson(oldValues))
                .newValues(toJson(newValues))
                .build());
        log.info("Audit {} {}:{} by user {}", action, entityType, entityId, userId);
    }

    @Transactional(readOnly = true)
    public Page<AuditLog> getLogs(String entityType, String entityId, Pageable pageable) {
        if (entityType != null && !entityType.isBlank() && entityId != null && !entityId.isBlank()) {
            return auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId, pageable);
        } else if (entityType != null && !entityType.isBlank()) {
            return auditLogRepository.findByEntityTypeOrderByCreatedAtDesc(entityType, pageable);
        }
        return auditLogRepository.findAllByOrderByCreatedAtDesc(pageable);
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
