package com.ecomerce.messaging.outbox;

import com.ecomerce.entity.OutboxEvent;
import com.ecomerce.messaging.event.OrderCreatedEvent;
import com.ecomerce.messaging.handler.OrderCreatedHandler;
import com.ecomerce.repository.OutboxEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Drains the transactional outbox, in-process (no message broker).
 *
 * An order commits together with its ORDER_CREATED row in outbox_events. This poller runs
 * after commit, so checkout never waits for notifications.
 *
 * Each poll claims a batch of due events with FOR UPDATE SKIP LOCKED (safe with several
 * backend instances), and runs the idempotent handler for each in its own transaction.
 * A failure increments attempt_count and schedules the next try with exponential backoff,
 * so one failing event never blocks newer ones. After max attempts the event stays
 * unpublished and is shown on the admin status page, where an operator can retry it.
 */
@Component
@Slf4j
public class OutboxPublisher {

    private final OutboxEventRepository repository;
    private final OrderCreatedHandler orderCreatedHandler;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate batchTx;
    private final TransactionTemplate handlerTx;

    private final AtomicLong published = new AtomicLong();
    private final AtomicLong failed = new AtomicLong();
    private volatile OffsetDateTime lastRunAt;

    @Value("${app.outbox.batch-size:20}")
    private int batchSize = 20;

    @Value("${app.outbox.max-attempts:8}")
    private int maxAttempts = 8;

    @Value("${app.outbox.backoff-base-seconds:5}")
    private long backoffBaseSeconds = 5;

    @Value("${app.outbox.backoff-max-seconds:600}")
    private long backoffMaxSeconds = 600;

    public OutboxPublisher(OutboxEventRepository repository, OrderCreatedHandler orderCreatedHandler,
                           ObjectMapper objectMapper, PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.orderCreatedHandler = orderCreatedHandler;
        this.objectMapper = objectMapper;
        this.batchTx = new TransactionTemplate(transactionManager);
        this.handlerTx = new TransactionTemplate(transactionManager);
        this.handlerTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms:3000}",
            initialDelayString = "${app.outbox.initial-delay-ms:5000}")
    public void poll() {
        try {
            publishBatch();
        } catch (RuntimeException e) {
            log.warn("Outbox poll failed: {}", e.getClass().getSimpleName()); // retried next tick
        }
    }

    /** One batch in one transaction; returns how many events were delivered. */
    public int publishBatch() {
        lastRunAt = OffsetDateTime.now();
        Integer delivered = batchTx.execute(status -> {
            List<OutboxEvent> events = repository.claimDue(maxAttempts, batchSize);
            int ok = 0;
            for (OutboxEvent event : events) {
                try {
                    dispatch(event);
                    event.setPublishedAt(OffsetDateTime.now());
                    event.setAttemptCount(event.getAttemptCount() + 1);
                    event.setLastError(null);
                    event.setNextAttemptAt(null);
                    published.incrementAndGet();
                    ok++;
                } catch (Exception e) {
                    int attempts = event.getAttemptCount() + 1;
                    event.setAttemptCount(attempts);
                    event.setLastError(sanitise(e));
                    event.setNextAttemptAt(OffsetDateTime.now().plus(backoff(attempts, backoffBaseSeconds, backoffMaxSeconds)));
                    failed.incrementAndGet();
                    if (attempts >= maxAttempts) {
                        log.error("Outbox event {} ({}) failed {} times; parked for operator review",
                                event.getId(), event.getEventType(), attempts);
                    } else {
                        log.warn("Outbox event {} ({}) attempt {} failed: {}",
                                event.getId(), event.getEventType(), attempts, sanitise(e));
                    }
                }
                repository.save(event);
            }
            return ok;
        });
        return delivered == null ? 0 : delivered;
    }

    private void dispatch(OutboxEvent event) throws Exception {
        if (!OrderCreatedEvent.TYPE.equals(event.getEventType())) {
            log.debug("No handler for {}; marking delivered", event.getEventType());
            return;
        }
        OrderCreatedEvent payload = objectMapper.readValue(event.getPayload(), OrderCreatedEvent.class);
        // Own transaction, so a handler failure does not poison the batch transaction.
        handlerTx.executeWithoutResult(status -> orderCreatedHandler.handle(payload));
    }

    /** base × 2^(attempt-1), capped. attempt 1 → base, 2 → 2×base, 3 → 4×base … */
    static Duration backoff(int attempt, long baseSeconds, long maxSeconds) {
        long factor = 1L << Math.min(Math.max(attempt - 1, 0), 20);
        return Duration.ofSeconds(Math.min(Math.max(baseSeconds, 1) * factor, Math.max(maxSeconds, 1)));
    }

    /** Short, bounded and free of payload data or credentials. */
    static String sanitise(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage() == null ? "" : root.getMessage().replaceAll("[\\r\\n]+", " ");
        message = message.replaceAll("(?i)(redis|rediss|postgres(ql)?|jdbc:[a-z]+)://\\S+", "$1://***");
        String text = root.getClass().getSimpleName() + (message.isBlank() ? "" : ": " + message);
        return text.length() > 300 ? text.substring(0, 300) : text;
    }

    // ─── Stats for the admin status page ────────────────────────────────────

    public long publishedCount() {
        return published.get();
    }

    public long failedAttemptCount() {
        return failed.get();
    }

    public OffsetDateTime lastRunAt() {
        return lastRunAt;
    }

    public int maxAttempts() {
        return maxAttempts;
    }
}
