package com.ecomerce.exception;

import com.ecomerce.common.observability.RequestIdFilter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * One error shape for the whole API:
 * <pre>{ "code", "message", "details", "requestId", "timestamp" }</pre>
 * Never exposes stack traces, SQL, or infrastructure details.
 */
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    // ─── Business exceptions ──────────────────────────────────────────────────

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex) {
        return build(HttpStatus.NOT_FOUND, ex.getCode(), ex.getMessage(), null);
    }

    @ExceptionHandler(EmailNotVerifiedException.class)
    public ResponseEntity<ApiError> handleEmailNotVerified(EmailNotVerifiedException ex) {
        return build(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED", ex.getMessage(), null);
    }

    @ExceptionHandler(AccountSuspendedException.class)
    public ResponseEntity<ApiError> handleSuspended(AccountSuspendedException ex) {
        return build(HttpStatus.FORBIDDEN, "ACCOUNT_SUSPENDED", ex.getMessage(), null);
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ApiError> handleUnauthorized(UnauthorizedException ex) {
        return build(HttpStatus.FORBIDDEN, "FORBIDDEN", ex.getMessage(), null);
    }

    @ExceptionHandler(InsufficientStockException.class)
    public ResponseEntity<ApiError> handleInsufficientStock(InsufficientStockException ex) {
        Map<String, Object> details = new HashMap<>();
        if (ex.getProductId() != null) details.put("productId", ex.getProductId());
        if (ex.getProductNameValue() != null) details.put("productName", ex.getProductNameValue());
        if (ex.getRequestedQuantity() > 0) details.put("requestedQuantity", ex.getRequestedQuantity());
        if (ex.getAvailableStock() >= 0) details.put("availableStock", ex.getAvailableStock());
        return build(HttpStatus.CONFLICT, "INSUFFICIENT_STOCK", ex.getMessage(), details);
    }

    @ExceptionHandler(PriceChangedException.class)
    public ResponseEntity<ApiError> handlePriceChanged(PriceChangedException ex) {
        Map<String, Object> details = new HashMap<>();
        details.put("updatedProducts", ex.getUpdatedProducts());
        details.put("changes", ex.getChanges());
        return build(HttpStatus.CONFLICT, "PRICE_CHANGED", ex.getMessage(), details);
    }

    @ExceptionHandler(ProductUnavailableException.class)
    public ResponseEntity<ApiError> handleProductUnavailable(ProductUnavailableException ex) {
        Map<String, Object> details = new HashMap<>();
        details.put("productId", ex.getProductId());
        details.put("productName", ex.getProductName());
        return build(HttpStatus.CONFLICT, "PRODUCT_UNAVAILABLE", ex.getMessage(), details);
    }

    @ExceptionHandler(OptimisticLockConflictException.class)
    public ResponseEntity<ApiError> handleOptimisticLock(OptimisticLockConflictException ex) {
        Map<String, Object> details = null;
        if (ex.getCurrent() != null) {
            details = new HashMap<>();
            details.put("current", ex.getCurrent());
        }
        return build(HttpStatus.CONFLICT, "PRODUCT_MODIFIED_BY_ANOTHER_USER", ex.getMessage(), details);
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiError> handleJpaOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        return build(HttpStatus.CONFLICT, "PRODUCT_MODIFIED_BY_ANOTHER_USER",
                "This product changed while you were editing it. Reload it, review the latest values, and save again.",
                null);
    }

    @ExceptionHandler(IdempotencyKeyReusedException.class)
    public ResponseEntity<ApiError> handleIdempotencyKeyReused(IdempotencyKeyReusedException ex) {
        return build(HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_REUSED", ex.getMessage(), null);
    }

    @ExceptionHandler(CheckoutInProgressException.class)
    public ResponseEntity<ApiError> handleCheckoutInProgress(CheckoutInProgressException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .header(HttpHeaders.RETRY_AFTER, "2")
                .body(body("CHECKOUT_IN_PROGRESS", ex.getMessage(), null));
    }

    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<ApiError> handleRateLimited(RateLimitedException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(body("RATE_LIMITED", ex.getMessage(),
                        Map.of("retryAfterSeconds", ex.getRetryAfterSeconds())));
    }

    @ExceptionHandler(CartUnavailableException.class)
    public ResponseEntity<ApiError> handleCartUnavailable(CartUnavailableException ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header(HttpHeaders.RETRY_AFTER, "10")
                .body(body("CART_UNAVAILABLE", ex.getMessage(), null));
    }

    @ExceptionHandler(PessimisticLockingFailureException.class)
    public ResponseEntity<ApiError> handleLockFailure(PessimisticLockingFailureException ex) {
        log.warn("Lock timeout/deadlock: {}", ex.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header(HttpHeaders.RETRY_AFTER, "1")
                .body(body("TEMPORARILY_UNAVAILABLE", "The store is busy. Please try again.", null));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleIntegrity(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getClass().getSimpleName());
        return build(HttpStatus.CONFLICT, "CONFLICT",
                "That change conflicts with existing data. Refresh and try again.", null);
    }

    // ─── Auth ─────────────────────────────────────────────────────────────────

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiError> handleBadCredentials(BadCredentialsException ex) {
        return build(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Invalid email or password", null);
    }

    @ExceptionHandler(org.springframework.security.core.AuthenticationException.class)
    public ResponseEntity<ApiError> handleAuthentication(org.springframework.security.core.AuthenticationException ex) {
        return build(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Please sign in to continue.", null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex) {
        return build(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied", null);
    }

    // ─── Validation ───────────────────────────────────────────────────────────

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> validationErrors = new LinkedHashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String field = error instanceof FieldError fe ? fe.getField() : error.getObjectName();
            validationErrors.putIfAbsent(field, error.getDefaultMessage());
        });
        String summary = validationErrors.isEmpty()
                ? "Invalid request data"
                : String.join("; ", validationErrors.values().stream().map(Object::toString).toList());
        return build(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", summary, validationErrors);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException ex) {
        return build(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", ex.getMessage(), null);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingRequestHeaderException.class})
    public ResponseEntity<ApiError> handleUnreadable(Exception ex) {
        return build(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "The request could not be read.", null);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex) {
        return build(HttpStatus.NOT_FOUND, "NOT_FOUND", "Not found", null);
    }

    // ─── File upload ──────────────────────────────────────────────────────────

    @ExceptionHandler({MaxUploadSizeExceededException.class, MultipartException.class})
    public ResponseEntity<ApiError> handleUpload(Exception ex) {
        log.warn("Image upload rejected: {}", ex.getMessage());
        return build(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                "Use a JPEG, PNG, or WebP image under 10 MB.", null);
    }

    // ─── Catch-all ───────────────────────────────────────────────────────────

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneral(Exception ex) {
        log.error("Unhandled exception", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "Something went wrong on our side. Please try again.", null);
    }

    // ─── Builder helper ───────────────────────────────────────────────────────

    private ResponseEntity<ApiError> build(HttpStatus status, String code, String message,
                                           Map<String, Object> details) {
        return ResponseEntity.status(status).body(body(code, message, details));
    }

    public static ApiError body(String code, String message, Map<String, Object> details) {
        return ApiError.builder()
                .requestId(RequestIdFilter.currentRequestId())
                .code(code)
                .message(message)
                .details(details)
                .timestamp(Instant.now().toString())
                .build();
    }

    @lombok.Builder
    @lombok.Data
    public static class ApiError {
        private String code;
        private String message;
        private Map<String, Object> details;
        private String requestId;
        private String timestamp;
    }
}
