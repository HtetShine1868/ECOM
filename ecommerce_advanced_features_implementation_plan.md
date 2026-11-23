# E-commerce Advanced Features --- AI Agent Implementation Plan

## 1. Project Context

Implement the advanced features below in the existing e-commerce
application. Extend the current codebase; do not rewrite the application
or replace working functionality.

### Existing technology stack

-   Frontend: React + Vite
-   Backend: Spring Boot 3.3.x, Java 21
-   Database: Supabase PostgreSQL
-   Product image storage: Supabase Storage
-   Authentication: existing JWT and OAuth2 login implementation
-   Deployment: Vercel (frontend) and Render (backend)
-   Redis: to be introduced for cache, cart, and rate limiting
-   RabbitMQ: to be introduced for asynchronous event processing

Before making changes, inspect the repository and report: 1. Current
frontend and backend folder structures. 2. Existing entities,
repositories, services, controllers, DTOs, security configuration, and
database migrations/schema. 3. Existing authentication and role model.
4. Current cart, checkout, order, product, and admin implementations. 5.
Existing deployment/environment-variable conventions.

Use the existing naming conventions and architecture wherever
reasonable. Do not create duplicate modules or parallel implementations.

## 2. Main Goals

Implement these features, excluding inventory reservation:

1.  Redis product/category caching.
2.  Redis-backed shopping cart.
3.  Atomic stock updates and transaction-safe checkout.
4.  Checkout idempotency.
5.  Optimistic locking for concurrent product edits.
6.  Pessimistic locking only where a demonstrated business operation
    requires it.
7.  API rate limiting.
8.  RabbitMQ asynchronous processing.
9.  Transactional outbox for reliable event publishing.
10. Reliable message consumers with retry, dead-letter handling, and
    idempotency.
11. Product/cart price-change handling.
12. Admin audit history for product and stock changes.
13. Tests, observability, and documentation.

**Explicit exclusion:** Do not implement inventory reservation,
temporary stock holds, reservation expiration, or reserved-stock
accounting. Adding a product to a cart must not decrement or reserve
stock.

## 3. Non-Negotiable Business Rules

-   PostgreSQL is the source of truth for product data, prices,
    inventory, orders, and payment/order state.
-   Redis is a performance and temporary cart store. It must never be
    the final authority for stock, checkout price, or order totals.
-   Adding/removing/updating a cart item does not change product stock.
-   Validate current product status, price, and stock again on the
    backend during checkout.
-   Never trust prices, totals, discounts, roles, or stock values sent
    by the frontend.
-   A successful checkout must create the order, order items, and
    inventory changes in one PostgreSQL transaction.
-   If any product in a multi-product order is unavailable, roll back
    the complete order transaction.
-   Store product name and unit price snapshots in order items. Later
    product edits must not alter historical orders or receipts.
-   Do not physically delete products referenced by historical order
    items. Prefer deactivation/soft deletion.
-   Do not use Redis locks as a substitute for database inventory
    correctness.
-   Do not introduce microservices. Keep the backend as a modular
    monolith.
-   Do not introduce Kafka, Kubernetes, or unnecessary infrastructure.
-   Do not implement inventory reservation.

## 4. Phase 0 --- Repository Assessment and Design

### Tasks

1.  Inspect the existing repository and identify the current
    implementation of:
    -   Product and category management
    -   Cart
    -   Checkout and order creation
    -   Order items
    -   Payment integration, if present
    -   Admin product and inventory updates
    -   Authentication and authorization
2.  Identify the current database migration mechanism. Use it for all
    schema changes.
3.  Identify how frontend API calls, errors, environment variables, and
    state management are currently handled.
4.  Identify whether Redis and RabbitMQ are already configured.
5.  Produce a short implementation report with:
    -   Existing components to reuse
    -   Components requiring changes
    -   New components required
    -   Database migration plan
    -   Environment variables required
    -   Risks and assumptions

### Acceptance criteria

-   No code has been changed before the current architecture is
    understood.
-   The implementation plan maps every new feature to the existing
    codebase.
-   Existing features and API contracts that must remain compatible are
    identified.

## 5. Phase 1 --- Database and Checkout Correctness

Implement database correctness before introducing cache or messaging.

### 5.1 Product data and constraints

Review the existing product table. Ensure it has appropriate fields
for: - ID - Name - Description - Price using `NUMERIC`, not
floating-point - Stock as a non-negative integer - Active/inactive
status - Version number for optimistic locking, if using JPA
`@Version` - Created and updated timestamps

Add database constraints where appropriate: - Price must be
non-negative. - Stock must be non-negative. - Required product fields
must not be null.

Do not add `reserved_stock` or any inventory reservation fields.

### 5.2 Order item snapshots

Ensure each order item stores at least: - Product ID reference, nullable
if the product may later be removed under the chosen retention policy -
Product name snapshot - Unit price snapshot - Quantity - Line subtotal

The order should also preserve the final charged total and relevant
delivery/discount amounts. Historical receipts must use the stored order
and order-item snapshots, not current product records.

### 5.3 Atomic inventory decrement

Do not implement checkout as "read stock, then later update stock"
without concurrency protection.

Use a conditional atomic database update equivalent to:

``` sql
UPDATE products
SET stock = stock - :quantity,
    updated_at = CURRENT_TIMESTAMP
WHERE id = :productId
  AND active = TRUE
  AND stock >= :quantity;
```

Check the affected-row count: - One row updated: the requested quantity
was available. - Zero rows updated: product is unavailable, inactive,
missing, or has insufficient stock. Distinguish these cases with a
follow-up read if needed for the response, but do not use that read as
the stock-safety mechanism.

For an order with multiple products: 1. Validate the request structure
and quantities. 2. Sort product IDs consistently before updating them to
reduce deadlock risk. 3. Start one database transaction. 4. Validate
current product status and current prices. 5. Apply the conditional
stock updates for every item. 6. If any update affects zero rows, throw
an exception and roll back all updates. 7. Insert the order and
order-item snapshots. 8. Insert required outbox events in the same
transaction. 9. Commit.

Do not call external payment providers or RabbitMQ while holding a
database transaction open. Follow the existing payment flow and use
payment webhooks/compensation where applicable.

### 5.4 Price-change confirmation

The cart is not a price guarantee.

When displaying the cart: - Read current product details and current
prices from the backend. - Compare them with the price/version last
reviewed by the frontend, if available. - Return a clear `priceChanged`
indicator when the price differs.

At checkout: - The frontend may submit the expected price/version that
the customer last reviewed. - The backend must independently load the
current database price. - If the expected price/version differs from the
current value, do not silently charge the new price. Return a structured
`PRICE_CHANGED` response containing safe current product details and
require the customer to review and confirm again. - On the confirmed
retry, calculate all totals on the backend and snapshot the accepted
prices in the order transaction.

Never accept the client-submitted total as authoritative.

### Acceptance criteria

-   Two concurrent checkouts cannot purchase the final unit twice.
-   A multi-item checkout either succeeds completely or rolls back
    completely.
-   A failed checkout does not leave partial stock decrements or partial
    orders.
-   Product edits do not change historical order receipts.
-   Price changes are clearly surfaced and require customer
    confirmation.

## 6. Phase 2 --- Checkout Idempotency

### Problem

A customer may double-click checkout, refresh after a timeout, or retry
a request when the first response was lost. These retries must not
create duplicate orders.

### Implementation

Create an idempotency record table using the project's migration
mechanism. Suggested fields:

-   ID
-   User ID
-   Idempotency key
-   Request hash
-   Status (for example: `PROCESSING`, `SUCCEEDED`, `FAILED`)
-   Order ID or stored response reference
-   Created timestamp
-   Updated timestamp

Add a unique database constraint:

``` sql
UNIQUE (user_id, idempotency_key)
```

Backend behavior: 1. Require an idempotency key for checkout. 2.
Canonicalize the relevant checkout request and calculate a request hash.
3. Attempt to create or claim the idempotency record. 4. If the key
already exists with a different request hash, reject it with a clear
conflict response. 5. If the key already completed successfully, return
the original order result. 6. If another request with the same key is
currently processing, return a documented in-progress response or safely
wait/retrieve its result. 7. Ensure the idempotency record and order
outcome are coordinated transactionally so a crash cannot create an
untraceable duplicate. 8. Do not rely only on an in-memory map or Redis
key for idempotency.

Frontend behavior: - Generate one key for one checkout attempt. - Reuse
the same key when retrying that same attempt after a timeout. - Generate
a new key only for a genuinely new checkout attempt. - Prevent
accidental repeated clicks while the request is pending, but retain
backend protection.

### Acceptance criteria

-   Repeating a successful request with the same key returns the same
    order.
-   Concurrent requests using the same key do not create duplicate
    orders.
-   Reusing a key with a different payload is rejected.
-   A network timeout followed by retry does not create a second order.

## 7. Phase 3 --- Redis Product and Category Cache

### Cache-aside behavior

For cacheable product/category reads: 1. Check Redis. 2. If a valid
cache entry exists, return it. 3. Otherwise read PostgreSQL. 4. Store
the result in Redis with a configurable TTL. 5. Return the database
result.

Suggested key conventions:

``` text
product:{productId}
category:{categoryId}
categories:all
products:featured:{filterHash}
products:popular:{filterHash}
```

Use a serialization format compatible with the existing application. Set
TTLs appropriate to the data and make them configurable.

### Cache invalidation

After an admin successfully creates, updates, deactivates, or deletes a
product: - Commit the database transaction first. - Invalidate or update
affected product and listing cache keys. - Invalidate
category/listing/popular/featured caches when their contents may have
changed. - Do not invalidate cache before the database transaction
commits. - If reliable invalidation is needed, publish a product-change
outbox event and let a consumer invalidate caches. Keep the approach
proportionate to the current project.

### Important rules

-   Never use cached stock or cached price as checkout authority.
-   Do not cache user-specific private information in shared public
    keys.
-   Avoid unbounded cache keys and unbounded TTLs.
-   Handle Redis being unavailable gracefully: database-backed product
    browsing should continue where possible.
-   Add cache metrics/logging for hit, miss, and error rates if
    practical.

### Acceptance criteria

-   Repeated product reads can be served from Redis.
-   Cache misses correctly fall back to PostgreSQL.
-   Admin changes do not leave stale product data visible beyond the
    defined invalidation behavior.
-   Checkout remains correct when Redis is unavailable or contains stale
    data.

## 8. Phase 4 --- Redis Shopping Cart

### Cart rules

-   Store cart identity by authenticated user ID.
-   Use Redis for active cart data.
-   Store product IDs and quantities, not trusted prices or totals.
-   Adding an item to the cart does not decrement stock.
-   Cart operations must not create inventory reservations.
-   Validate quantity limits and product eligibility.
-   Reconcile cart data against current product data when reading the
    cart and during checkout.

Suggested key:

``` text
cart:user:{userId}
```

Suggested structure:

``` text
productId -> quantity
```

Use atomic Redis operations such as `HINCRBY` for simple quantity
increments. For compound operations, use an appropriate Redis
transaction or Lua script if required.

### Cart API behavior

Support the existing API conventions, with equivalent operations for: -
Get current cart - Add product - Update quantity - Remove product -
Clear cart

Cart response should include current backend product information: -
Product ID - Name - Current price - Requested quantity - Current
availability - Image - Active status - Price-change indicator when
applicable

If a product is deactivated or deleted, return a clear unavailable item
state and prevent checkout for that item.

### Cart persistence and failure handling

Decide and document how carts survive Redis restarts: - Configure Redis
persistence if supported by the hosting environment, and/or -
Periodically or on meaningful changes persist carts to PostgreSQL, or -
Explicitly document that carts are temporary and may be lost.

Do not claim carts are durable unless the implementation actually
guarantees it.

### Acceptance criteria

-   Users have isolated carts.
-   Cart quantity operations are safe under concurrent requests.
-   Cart updates do not change PostgreSQL stock.
-   A stale cart cannot bypass checkout price or stock validation.
-   Product deactivation is reflected in the cart.

## 9. Phase 5 --- Locking Strategy for Product Updates

### Optimistic locking

Use optimistic locking for admin product edits where concurrent updates
are possible.

For JPA, use a version field:

``` java
@Version
private Long version;
```

Expose the version in the relevant admin DTO. Require the client to
submit the version it edited. If the database version has changed,
reject the stale update with a conflict response rather than overwriting
another admin's changes.

Return a clear error such as `PRODUCT_MODIFIED_BY_ANOTHER_USER`; the
frontend should refresh the product and ask the admin to review the
latest values.

### Pessimistic locking

Do not add pessimistic locks everywhere. Use them only for a specific
operation that requires coordinated access to one or more rows and
cannot be safely expressed as a conditional update.

If used: - Keep the transaction short. - Lock rows in a consistent
order. - Handle lock timeout/deadlock errors. - Never perform slow
external network calls while holding locks.

For ordinary stock decrement, prefer the atomic conditional SQL from
Phase 1.

### Acceptance criteria

-   Two admins editing the same product cannot silently overwrite one
    another.
-   The UI can explain and recover from stale updates.
-   No unnecessary long-running row locks are introduced.

## 10. Phase 6 --- API Rate Limiting

Introduce rate limiting for sensitive or expensive endpoints.

Suggested policies (initial values are examples and must be
configurable):

  Endpoint category              Example policy
  ------------------------------ -----------------------------------------
  Login / OTP / authentication   Strict per-IP and per-account limits
  Search and product listing     Moderate per-IP/user limit
  Cart mutation                  Per-user limit
  Checkout                       Strict per-user limit, plus idempotency
  Admin APIs                     Authenticated role-aware limits
  Public product details         Higher limit

Implementation requirements: - Use Redis as the shared rate-limit store
so multiple backend instances share limits. - Use a well-maintained
Spring-compatible rate-limiting library or a carefully implemented
token-bucket/sliding-window solution. - Identify authenticated users by
user ID; use IP as an additional signal for anonymous endpoints. -
Handle reverse-proxy headers safely. Trust forwarded IP headers only
from known proxies. - Return HTTP `429 Too Many Requests`. - Include a
useful error body and, where practical, `Retry-After`. - Do not
rate-limit legitimate users so aggressively that normal browsing becomes
unusable. - Make thresholds configurable by environment.

### Acceptance criteria

-   Repeated abusive requests are limited across backend instances.
-   Normal customer browsing and checkout remain usable.
-   Rate-limit responses are consistent and documented.
-   Redis failure behavior is defined and does not accidentally disable
    all application traffic.

## 11. Phase 7 --- RabbitMQ and Asynchronous Processing

Use RabbitMQ for work that should happen after the main business
transaction, such as: - Order confirmation email - Receipt generation or
delivery - Admin order notifications - Analytics/event aggregation -
Other non-critical background tasks

Do not make the customer wait for email delivery before returning a
successful order response.

### Event design

Define versioned event payloads. Example:

``` json
{
  "eventId": "uuid",
  "eventType": "ORDER_CREATED",
  "eventVersion": 1,
  "occurredAt": "2026-01-01T10:00:00Z",
  "orderId": 123,
  "userId": 456
}
```

Avoid putting secrets, payment credentials, or unnecessary personal data
in messages. Consumers should load authoritative details from PostgreSQL
using the IDs.

### Transactional outbox

Create an `outbox_events` table with fields such as: - Event ID -
Aggregate type and ID - Event type and version - Payload - Created
timestamp - Published timestamp - Attempt count - Last error
(bounded/sanitized)

Inside the same PostgreSQL transaction that creates the order, insert an
`ORDER_CREATED` outbox event.

A scheduled publisher/worker should: 1. Read unpublished events safely,
using an appropriate claim/locking strategy. 2. Publish to RabbitMQ with
persistent delivery settings. 3. Mark the event published only after
broker confirmation. 4. Retry transient failures. 5. Avoid permanently
blocking other events when one event repeatedly fails.

Do not publish directly to RabbitMQ inside the order transaction and
assume the two systems commit atomically.

### RabbitMQ configuration

Define: - Durable exchanges and queues where appropriate. - Explicit
routing keys. - Persistent messages. - Publisher confirms. - Consumer
acknowledgements. - Bounded retry with backoff. - Dead-letter
exchange/queue for messages that exhaust retries.

Do not endlessly requeue poison messages.

### Consumer idempotency

Messages may be delivered more than once. Every consumer that performs a
side effect must be idempotent.

Use a processed-message table or equivalent durable deduplication
mechanism with a unique event ID. Record successful processing in the
same transaction as the consumer's database side effects when possible.

For email, use a stable notification/event identifier and prevent
repeated sends where feasible. Acknowledge a message only after
successful processing or after it has been safely moved to
retry/dead-letter handling.

### Acceptance criteria

-   Order creation succeeds even when RabbitMQ is temporarily
    unavailable, because the outbox event remains stored.
-   The publisher eventually publishes pending events after recovery.
-   Consumers handle duplicate messages safely.
-   Failed messages retry a bounded number of times and reach a
    dead-letter queue.
-   Customer checkout does not wait for email/receipt processing.




## 13. Phase 8 --- Frontend Work

Update the React application to reflect backend behavior.

### Customer UI

-   Cart shows current product price and availability.
-   Clearly display price changes and require confirmation before
    checkout.
-   Show unavailable/deactivated cart items.
-   Disable checkout while a request is processing, but retain backend
    idempotency.
-   Handle `PRICE_CHANGED`, `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`,
    `CHECKOUT_IN_PROGRESS`, and `RATE_LIMITED` responses.
-   On insufficient stock, explain which item is unavailable and let the
    customer update/remove it.
-   On checkout retry, reuse the same idempotency key for the same
    attempt.

### Admin UI

-   Handle optimistic-lock conflicts by refreshing the latest product
    and asking the admin to review changes.
-   Show audit history for relevant product and stock operations.
-   Show clear validation errors for invalid stock or price changes.
-   Do not show success until the backend confirms the operation.

### Architecture/interview screen

Add a dedicated engineering architecture page or section that
explains: - Overall system architecture - Why PostgreSQL is the source
of truth - Redis cache and cart behavior - Atomic inventory updates -
Idempotency - Optimistic vs pessimistic locking - Rate limiting -
RabbitMQ and transactional outbox - Failure-handling scenarios

Include interactive or clearly documented scenarios: 1. Two customers
attempt to buy the last item. 2. A customer retries checkout with the
same idempotency key. 3. An admin changes a product price while it is in
a cart. 4. Redis is unavailable. 5. RabbitMQ is unavailable after an
order commits. 6. Two admins edit the same product.

Do not claim a feature is implemented unless it is actually implemented
and tested. Clearly distinguish implemented features from planned
features.

## 14. Phase 9 --- Testing Strategy

Create automated tests at the appropriate layers.

### Unit tests

-   Price and total calculation
-   Cart quantity validation
-   Idempotency request hash validation
-   Product status validation
-   Rate-limit policy behavior
-   Event payload mapping

### Integration tests

-   PostgreSQL atomic stock decrement
-   Multi-product checkout rollback
-   Idempotency under repeated requests
-   Redis cart isolation by user
-   Redis cache invalidation
-   Optimistic-lock conflict
-   Outbox event creation and publishing
-   Consumer deduplication
-   Retry and dead-letter behavior

### Concurrency tests

At minimum, test: - Stock is 1 and two independent users attempt to buy
1 simultaneously: exactly one succeeds. - Stock is 5 and concurrent
requests attempt to buy quantities whose sum exceeds 5: successful total
quantity never exceeds 5. - Two requests use the same idempotency key
simultaneously: at most one order is created. - Two admins update the
same product version: one update succeeds and the stale update receives
a conflict. - A multi-product order fails on one item: no stock changes
or partial order remain.

Use a real PostgreSQL test environment for transaction/concurrency tests
where practical. Testcontainers may be used for local/CI tests if the
project supports it; it is not a requirement for production deployment.

### Failure tests

-   Redis unavailable: product reads fall back to PostgreSQL; checkout
    remains correct.
-   RabbitMQ unavailable: order commits and outbox event remains
    pending.
-   Consumer fails: message is retried and eventually dead-lettered.
-   Duplicate event arrives: consumer does not repeat the side effect.
-   Frontend receives 409/429/5xx: user sees a useful recovery message.

## 15. Phase 10 --- Configuration, Deployment, and Operations

Add configuration through environment variables. Never commit secrets.

Expected configuration categories: - PostgreSQL connection - Redis
connection and TLS settings as required by provider - RabbitMQ
connection, virtual host, credentials, and TLS settings - Cache TTLs -
Rate-limit thresholds - Outbox polling interval and batch size - Message
retry limits - Application logging and monitoring settings

Deployment requirements: - Use managed Redis and RabbitMQ services or
appropriately hosted alternatives. - Verify that the Render deployment
can reach the selected services. - Use TLS where supported. - Configure
connection timeouts and connection pools. - Keep local, staging, and
production configurations separate. - Add health/readiness checks for
PostgreSQL, Redis, and RabbitMQ without making optional dependency
outages unnecessarily take down unrelated read endpoints. - Do not
expose Redis or RabbitMQ management ports publicly without access
controls. - Add structured logs with request IDs, order IDs, event IDs,
and correlation IDs. - Never log passwords, tokens, payment credentials,
or full sensitive payloads.

## 16. API and Error Contract

Follow existing API conventions, but ensure consistent machine-readable
error codes.

Suggested error codes:

  ------------------------------------------------------------------------------------
  HTTP status             Error code                           Meaning
  ----------------------- ------------------------------------ -----------------------
  400                     `INVALID_REQUEST`                    Invalid request
                                                               structure or values

  401                     `UNAUTHENTICATED`                    Login required

  403                     `FORBIDDEN`                          Insufficient permission

  404                     `PRODUCT_NOT_FOUND`                  Product does not exist

  409                     `INSUFFICIENT_STOCK`                 Requested quantity is
                                                               unavailable

  409                     `PRICE_CHANGED`                      Customer must review
                                                               updated price

  409                     `IDEMPOTENCY_KEY_REUSED`             Same key used with
                                                               different request

  409                     `PRODUCT_MODIFIED_BY_ANOTHER_USER`   Stale optimistic-lock
                                                               update

  409                     `CHECKOUT_IN_PROGRESS`               Same checkout attempt
                                                               is processing

  429                     `RATE_LIMITED`                       Too many requests

  500                     `INTERNAL_ERROR`                     Unexpected server
                                                               failure
  ------------------------------------------------------------------------------------

Example response:

``` json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "The requested quantity is no longer available.",
  "details": {
    "productId": 101,
    "requestedQuantity": 2
  },
  "requestId": "request-id"
}
```

Do not expose stack traces, SQL details, secrets, or internal
infrastructure information to the client.

## 17. Suggested Backend Package Organization

Adapt this to the existing project rather than forcing a full package
restructure.

``` text
src/main/java/<existing-base-package>/
├── config/
│   ├── RedisConfig.java
│   ├── RabbitMqConfig.java
│   └── RateLimitConfig.java
├── security/
├── user/
├── product/
├── category/
├── cart/
├── inventory/
├── checkout/
├── order/
├── payment/
├── idempotency/
├── messaging/
│   ├── event/
│   ├── publisher/
│   ├── consumer/
│   └── outbox/
├── notification/
├── audit/
├── analytics/
└── common/
    ├── exception/
    ├── response/
    └── observability/
```

Each business module should own its controller, service, repository,
DTOs, and domain logic as appropriate. Avoid creating a generic
framework for every module.

## 18. Implementation Order and Delivery Rules

Implement in this order:

1.  Repository assessment and design report.
2.  Database migrations and constraints.
3.  Atomic stock updates and transaction-safe checkout.
4.  Price-change confirmation and historical order snapshots.
5.  Idempotency.
6.  Redis product/category cache.
7.  Redis cart.
8.  Optimistic locking for admin product edits.
9.  Rate limiting.
10. Outbox and RabbitMQ.
11. Idempotent consumers, retries, and DLQ.
12. Admin audit history.
13. Frontend error handling and architecture/interview page.
14. Automated tests, deployment configuration, and documentation.

For each phase: - Explain the intended change before editing. -
Implement the smallest complete vertical slice. - Run relevant backend
and frontend tests/builds. - Fix regressions before continuing. -
Provide changed file paths and a concise explanation. - Provide
migration instructions and new environment variables. - Update API
documentation and README. - Do not silently skip failed tests. - Do not
fabricate test results. - Do not remove existing features to make new
tests pass. - Do not commit credentials or secrets. - Ask before
destructive database changes or changes that could affect production
data.

## 19. Definition of Done

The implementation is complete only when:

-   [ ] Existing customer and admin functionality still works.
-   [ ] Cart operations do not reserve or decrement inventory.
-   [ ] Concurrent checkout cannot oversell stock.
-   [ ] Multi-item checkout is all-or-nothing.
-   [ ] Duplicate checkout retries do not create duplicate orders.
-   [ ] Price changes require customer review before purchase.
-   [ ] Historical receipts retain their original product names and
    prices.
-   [ ] Redis cache invalidates after product changes.
-   [ ] Redis cart is isolated by user and reconciled with current
    products.
-   [ ] Optimistic locking prevents stale admin updates.
-   [ ] Rate limiting returns consistent 429 responses.
-   [ ] Order events are stored in the outbox with the order
    transaction.
-   [ ] RabbitMQ consumers are idempotent and have bounded retries/DLQ.
-   [ ] Admin changes are auditable.
-   [ ] Concurrency and failure scenarios have automated tests.
-   [ ] Deployment configuration and secrets are documented.
-   [ ] The architecture/interview page accurately describes implemented
    behavior.

## 20. Final Instructions to the AI Coding Agent

Work incrementally in the existing repository. Prioritize correctness,
data integrity, security, and maintainability over adding technologies
for appearance.

Do not implement inventory reservation in this task.

Do not assume the current codebase matches this document exactly.
Inspect it first, identify differences, and adapt the plan. If a
required feature already exists, verify and test it rather than
duplicating it.

Before implementing a phase, state: 1. What will change. 2. Which
files/modules will be affected. 3. Which database migrations are needed.
4. How the change will be tested.

After implementing a phase, report: 1. What was implemented. 2. Files
changed. 3. Migrations applied or required. 4. Tests executed and their
actual results. 5. New environment variables. 6. Remaining risks or
unfinished work.
