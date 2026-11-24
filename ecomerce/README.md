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


---

# Accounts, reviews and recommendations

## Email verification

- Registering creates the account as `PENDING_EMAIL` / unverified and emails a single-use link (24 h). Only the SHA-256 **hash** of the token is stored. A newer link invalidates older ones.
- An unverified shopper can browse, search, view products, use the bag and see their profile. **Checkout, placing orders and reviews are blocked** with `403 EMAIL_NOT_VERIFIED`, checked from the database on every request (never from the token or the client). Suspended accounts get `403 ACCOUNT_SUSPENDED`, cannot sign in, and their existing sessions stop working.
- `POST /api/auth/verify-email`, `POST /api/auth/resend-verification` (60 s cooldown; the answer is identical whether or not the account exists, and nothing is sent to verified accounts).
- **Email needs SMTP.** Set `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`. Without `MAIL_HOST` nothing is emailed; the link is written to the server log (development only: anyone who can read the log could verify the account).
- **Set `FRONTEND_URL` on Render**, otherwise the links in emails point at `localhost`.
- Existing users: social-login accounts and admins are marked verified by the schema migration. Existing password accounts stay unverified and confirm by email.

## Google and Facebook

- A social identity is (provider, provider user id). Google must report `email_verified=true`; Google and Facebook accounts are active immediately with no extra email step.
- **Accounts are never merged on a matching email.** If the email already belongs to a password account (or another provider), the social login is refused with `error=account_exists` and the shopper is told to sign in the original way. (This closes a takeover where someone registers a victim's email first.) Linking a second login method from inside a signed-in session is **not implemented**.

## Reviews

`GET /api/products/{id}/reviews` (page, size, `sortBy=newest|oldest|highest|lowest`), `GET /api/products/{id}/rating-summary`, `GET /api/products/{id}/review-eligibility` (returns `eligible` and a `reason`), `POST /api/products/{id}/reviews`, `PUT|DELETE /api/reviews/{id}`, `GET /api/users/me/reviews`, `POST /api/reviews/images` (upload photos first; the review then carries the returned URLs, and any other URL is rejected).

- Eligible only if: signed in, email verified, not suspended, **an order containing the product is DELIVERED**, not already reviewed (one per customer per product; one per order item).
- Public immediately, editable and deletable by the author only. No moderation.
- The rating summary is recomputed from the reviews table under a per-product advisory lock, so simultaneous reviews cannot lose each other.
- Product cards, listings and detail responses carry `averageRating` and `totalReviews`.
- Photos need Supabase Storage (same bucket, `reviews/` prefix). Photos uploaded but never attached to a posted review are not cleaned up.

## Recommendations

Computed in Java from PostgreSQL. No external AI is required for them.

`GET /api/recommendations/for-you | popular | related/{id} | frequently-bought/{id} | recently-viewed | for-cart` (limits are clamped; each item has a `recommendationType` and a short `reason`).

- `finalScore = content*0.40 + behavior*0.30 + popularity*0.20 + rating*0.10`, each part 0-100, weights configurable.
- Events are decayed by `weight * exp(-lambda * ageInDays)`. Interests are rebuilt each time, never frozen to one category. Brand, tags and attributes do not exist in the schema, so content matching uses category and price band.
- Rules: active and in-stock only, never the current product, no duplicates, already-bought items left out of "for you", one category cannot fill more than half the list, ties break by units sold then id. Too little activity returns popular products labelled as such; "frequently bought together" shows only real co-purchases.
- **Tracking:** the browser reports only `VIEW` and `SEARCH_CLICK`. `ADD_TO_CART` and `PURCHASE` are recorded by the server (a client sending them gets 400). Weights come from configuration. Purchases are recorded after the order commits, so tracking can never fail an order. `product_co_occurrences` counts each product pair once per order, canonical order.
- **Redis** holds only product IDs, reasons and scores (`recommendations:user:{id}`, `:related:{id}`, `:popular`, `:frequently-bought:{id}`) and rating summaries (`product:rating:{id}`), with the TTLs from the spec. Price, stock and rating are re-read from PostgreSQL on every response. Caches are cleared after the database commit when a product, stock, purchase or review changes. Redis is optional.
- Limitation: a cancelled order still counts toward co-purchases and purchase history.

## Verification run for these features

Against PostgreSQL 16 and Redis 7: 100 API checks (token hashing, single use, expiry, resend cooldown, suspended accounts, delivered-only eligibility, duplicate prevention, rating math under a 3-way concurrent race, privacy of reviewer names, event weights and dedupe, co-purchase counting, every recommendation rule, cache keys, TTLs and invalidation) and 35 real-browser checks (signup to verified, checkout gating, writing/editing/deleting a review, account page, every recommendation section, bag suggestions never auto-adding, mobile layout). **Not exercised live:** Google/Facebook sign-in, SMTP delivery, and review photo storage (they need real provider accounts); their code compiles and follows the rules above.
