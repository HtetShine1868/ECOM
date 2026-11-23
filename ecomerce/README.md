# ShopNow backend

Spring Boot 3.3 / Java 21 modular monolith. PostgreSQL (Supabase) is the source of truth.
Redis is optional. There is no message broker.

## What is implemented

| Area | Behavior |
|---|---|
| Stock safety | Checkout decrements stock with one conditional `UPDATE ... WHERE active AND stock >= qty` per item, in ascending product-ID order, inside one transaction. Any failure rolls back the whole order. |
| Checkout | `CheckoutService`. Totals come only from server prices. Order items store name, unit price, cargo price and line total snapshots. Product edits never change old receipts. |
| Idempotency | `idempotency_records` with `UNIQUE (user_id, idempotency_key)` plus a unique index on `orders.idempotency_key`. Same key + same order returns the original order; different order returns 409. Key is required. |
| Price changes | Cart reads show `priceChanged`. Checkout compares the client's `expectedUnitPrice` / `expectedCargoPrice` with the database and answers 409 `PRICE_CHANGED` without charging. |
| Cart | `/api/cart`. Stores product IDs, quantities and the price last reviewed. Never changes stock. Redis when configured, otherwise PostgreSQL. |
| Cache | Cache-aside for product detail, category list and best-sellers (all with TTLs). Evicted after the DB commit. Never used for checkout. |
| Optimistic locking | Admin product update requires `version`. Stale version returns 409 `PRODUCT_MODIFIED_BY_ANOTHER_USER` with the current product. A purchase also bumps the version, so an old admin form cannot overwrite newer stock. |
| Rate limiting | Fixed window, shared through Redis when enabled, otherwise per server. 429 `RATE_LIMITED` with `Retry-After`. All limits are env settings. |
| Outbox | `ORDER_CREATED` is written in the order transaction. A worker claims due rows (`FOR UPDATE SKIP LOCKED`), runs an idempotent handler (`processed_messages`), retries with exponential backoff, and parks rows after the maximum attempts. |
| Audit | Product create/update/stock/image/delete and order status changes, written in the same transaction, with the admin's identity. `GET /api/admin/audit-logs`. |
| Operations | `GET /actuator/health` (database only). `GET /api/admin/system/status` (admin): Redis, cache hit rate, outbox backlog. Every response carries `X-Request-Id`, also in logs and error bodies. |

## Cart durability (read this)

- **Redis cart:** temporary. It survives a Redis restart only if your Redis instance has persistence (AOF/RDB) turned on, and it expires after `CART_TTL_DAYS` of inactivity. If Redis is down, cart calls return 503 `CART_UNAVAILABLE`; browsing and checkout keep working.
- **No Redis configured:** the cart is stored in PostgreSQL and is durable.

## Not implemented / not used

- No RabbitMQ or other broker. Events are processed in-process from the outbox table.
- No pessimistic locks: the conditional UPDATE covers stock, and nothing else needed them.
- No inventory reservation. Adding to a cart never touches stock.
- Automated integration/concurrency tests (Testcontainers) are not written. The behavior was verified by running the app against a real PostgreSQL and Redis; see "Verification".

## Error format

```json
{ "code": "INSUFFICIENT_STOCK", "message": "...", "details": { }, "requestId": "...", "timestamp": "..." }
```

| HTTP | code |
|---|---|
| 400 | `INVALID_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `PRODUCT_NOT_FOUND`, `NOT_FOUND` |
| 409 | `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`, `PRICE_CHANGED`, `IDEMPOTENCY_KEY_REUSED`, `CHECKOUT_IN_PROGRESS`, `PRODUCT_MODIFIED_BY_ANOTHER_USER` |
| 429 | `RATE_LIMITED` (`Retry-After` header) |
| 503 | `CART_UNAVAILABLE`, `TEMPORARILY_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` |

## API changes that affect clients

- `POST /api/orders`: `idempotencyKey` (body) or `Idempotency-Key` (header) is now required. Items may include `expectedUnitPrice` and `expectedCargoPrice`.
- `PUT /api/admin/products/{id}`: `version` is required. `active` toggles sale status.
- `/api/cart/items/{productId}` uses the product ID. New: `POST /api/cart/acknowledge-prices`.
- Cart lines include `availability` (`IN_STOCK`, `INSUFFICIENT_STOCK`, `OUT_OF_STOCK`, `INACTIVE`, `REMOVED`), `priceChanged`, `previousPrice`.

## Database changes

`src/main/resources/schema.sql` runs on every start and is additive and re-runnable. Statements end with `;;` (see `spring.sql.init.separator`) so `DO $$` blocks work. It adds: product `active`/`version` and non-negative CHECKs, `idempotency_records`, `outbox_events`, `processed_messages`, `audit_log`, `order_items.line_total`, `cart_items.seen_unit_price`, and unique indexes. A unique index is created only when existing data already satisfies it; otherwise a NOTICE is logged and it is skipped. Nothing is deleted.

## Configuration

Copy `.env.example`. Never commit `.env`. New variables are all optional with safe defaults.

**Render:** set `REDIS_URL` to your Render Redis *internal* URL (`redis://red-...:6379`). That host name only resolves inside Render, so it cannot be used from a laptop; leave `REDIS_URL` empty locally. Keep `JPA_DDL_AUTO=validate` in production.

Behind Render's proxy the client IP comes from `X-Forwarded-For`, which Tomcat only trusts from private-range proxies (`server.forward-headers-strategy=NATIVE`), so clients cannot spoof it.

## Verification done

Run against a throwaway PostgreSQL 16 and Redis 7, then a real browser (Chrome) against the React app:

- login, registration, 401 body shape, per-user cart isolation, over-quantity rejection
- cache hit recorded; Redis stopped: product reads and admin writes keep working, cart returns 503
- checkout without key rejected; server-computed total; replay returns the same order; same key with another order returns 409; 4 concurrent same-key requests create 1 order
- price change returns `PRICE_CHANGED` with no stock taken; old receipt keeps the old price
- stale admin version returns 409; admin stock change is audited with before/after
- stock 1, two buyers at once: exactly one 201 and one 409, stock 0 (never negative)
- multi-item order with one unavailable item rolls back completely
- deactivated product shows as unavailable in the cart and blocks checkout
- outbox event delivered once and admin notified; 11th checkout in a minute gets 429 with `Retry-After`
- browser: add to bag, place order (double click makes one order), bag cleared, price-change banner blocks checkout until accepted, deactivated item blocks checkout

Existing unit tests still compile and pass (`./mvnw test`).
