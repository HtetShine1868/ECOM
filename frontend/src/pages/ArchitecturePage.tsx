import { useState } from "react";
import { Link } from "react-router-dom";

interface Scenario {
  id: string;
  title: string;
  badge: string;
  summary: string;
  steps: {
    title: string;
    description: string;
    system: "PostgreSQL" | "Redis" | "Outbox" | "Backend" | "Client";
    status: "ok" | "blocked" | "fallback" | "retried";
  }[];
  verdict: string;
}

const scenarios: Scenario[] = [
  {
    id: "concurrent-stock",
    title: "1. Two Customers Buying the Last Item Simultaneously",
    badge: "Atomic Conditional SQL",
    summary:
      "Stock = 1. Customer A and Customer B both submit checkout for 1 unit at the exact same millisecond.",
    steps: [
      {
        system: "Backend",
        title: "Requests validated",
        description: "Both requests validate payload and sort product IDs to prevent deadlock.",
        status: "ok",
      },
      {
        system: "PostgreSQL",
        title: "Atomic Conditional SQL executed",
        description:
          "UPDATE products SET stock = stock - 1 WHERE id = 101 AND active = TRUE AND stock >= 1",
        status: "ok",
      },
      {
        system: "PostgreSQL",
        title: "Row lock & count evaluated",
        description:
          "Postgres serializes row updates. Customer A's update returns affected rows = 1. Customer B's update evaluates against stock = 0 and returns affected rows = 0.",
        status: "ok",
      },
      {
        system: "Backend",
        title: "Customer A succeeds, Customer B rolls back",
        description:
          "Customer A's transaction commits. Customer B encounters rows = 0, throws InsufficientStockException, and completely rolls back.",
        status: "blocked",
      },
      {
        system: "Client",
        title: "Customer B receives 409 INSUFFICIENT_STOCK",
        description:
          "Client UI displays real-time out of stock notification and prompts user to update bag.",
        status: "blocked",
      },
    ],
    verdict: "Zero overselling possible. Database guarantees atomic consistency.",
  },
  {
    id: "idempotency-retry",
    title: "2. Customer Checkout Retry with Same Idempotency Key",
    badge: "Idempotent Safe Retries",
    summary:
      "A customer clicks 'Confirm Purchase', network connection drops after server processes the order, and customer clicks again.",
    steps: [
      {
        system: "Client",
        title: "Generates idempotencyKey",
        description: "Client attaches UUID idempotencyKey to checkout attempt.",
        status: "ok",
      },
      {
        system: "Backend",
        title: "Request hash computed",
        description:
          "Calculates SHA-256 hash of canonicalized order payload (sorted items, quantities, address, phone).",
        status: "ok",
      },
      {
        system: "PostgreSQL",
        title: "Attempt 1 committed",
        description:
          "Order #402 created, idempotency record marked SUCCEEDED with cached OrderResponse payload.",
        status: "ok",
      },
      {
        system: "Backend",
        title: "Attempt 2 arrives with same key",
        description:
          "Backend checks idempotency_records by (user_id, idempotency_key). Record exists with status SUCCEEDED and matching hash.",
        status: "retried",
      },
      {
        system: "Client",
        title: "Original Order #402 returned directly",
        description:
          "Backend returns original Order #402 without re-decrementing inventory or creating duplicate orders.",
        status: "ok",
      },
    ],
    verdict: "Duplicate order prevented. Customer receives their original receipt safely.",
  },
  {
    id: "price-change",
    title: "3. Admin Changes Price While Product is in Customer Cart",
    badge: "Price-Change Confirmation",
    summary:
      "Customer added product at $25. Admin raises price to $30 before customer checks out.",
    steps: [
      {
        system: "Client",
        title: "Client submits expectedUnitPrice = $25",
        description: "Cart payload passes the price customer last reviewed.",
        status: "ok",
      },
      {
        system: "Backend",
        title: "Backend compares with current DB price",
        description:
          "Backend loads live PostgreSQL price ($30) and detects difference from client-expected price ($25).",
        status: "ok",
      },
      {
        system: "Backend",
        title: "Checkout rejected with 409 PRICE_CHANGED",
        description:
          "Transaction halts before any inventory modification. Error payload returns updated product details.",
        status: "blocked",
      },
      {
        system: "Client",
        title: "Customer review dialog displayed",
        description:
          "UI displays amber Price Update Detected banner: 'Was $25 → Now $30. Accept and continue?'",
        status: "ok",
      },
      {
        system: "Client",
        title: "Customer confirms updated price",
        description:
          "On confirmation, cart updates expectedUnitPrice to $30 and completes order with correct snapshot.",
        status: "ok",
      },
    ],
    verdict: "Customer is never silently overcharged; store is never underpaid.",
  },
  {
    id: "redis-failure",
    title: "4. Redis Outage During Browsing and Checkout",
    badge: "Fail-Open & Resilient Fallback",
    summary:
      "Redis instance restarts or network connection drops while traffic is active.",
    steps: [
      {
        system: "Redis",
        title: "Connection failure detected",
        description: "Lettuce driver throws connection exception.",
        status: "fallback",
      },
      {
        system: "Backend",
        title: "Cache falls back to PostgreSQL",
        description:
          "After the first failure a short circuit-breaker skips Redis, so requests do not wait on timeouts, and product reads come straight from PostgreSQL.",
        status: "fallback",
      },
      {
        system: "Backend",
        title: "Cart shows a clear temporary error",
        description:
          "With Redis enabled the cart lives only in Redis, so cart actions answer 503 CART_UNAVAILABLE with a retry message. The bag is not split across two stores. Browsing and checkout are unaffected.",
        status: "fallback",
      },
      {
        system: "Backend",
        title: "Rate limits keep working per server",
        description:
          "The limiter switches to an in-memory counter on each server. Abuse protection stays on and traffic is not blocked because Redis is down.",
        status: "fallback",
      },
      {
        system: "PostgreSQL",
        title: "Checkout completes normally",
        description:
          "Checkout relies exclusively on PostgreSQL for stock & orders; continues without disruption.",
        status: "ok",
      },
    ],
    verdict: "Browsing and checkout stay correct. Only cart changes pause until Redis is back.",
  },
  {
    id: "outbox-failure",
    title: "5. Background Processing Fails After an Order Commits",
    badge: "Transactional Outbox",
    summary:
      "An order is placed, but the after-commit work (admin notification) fails the first time, for example during a short database hiccup.",
    steps: [
      {
        system: "PostgreSQL",
        title: "Order and outbox event committed together",
        description:
          "Order #501 and its ORDER_CREATED row in outbox_events are inserted in one transaction. If the order rolls back, the event never exists.",
        status: "ok",
      },
      {
        system: "Backend",
        title: "Checkout returns 201 immediately",
        description: "The customer is never kept waiting for notifications.",
        status: "ok",
      },
      {
        system: "Outbox",
        title: "Worker tries the event and it fails",
        description:
          "attempt_count goes up, a short error is stored, and next_attempt_at is pushed out with exponential backoff. Newer events are not blocked.",
        status: "fallback",
      },
      {
        system: "Outbox",
        title: "Worker retries later and succeeds",
        description:
          "The handler records the event id in processed_messages in the same transaction as the notification, so a repeat can never notify twice.",
        status: "retried",
      },
      {
        system: "Backend",
        title: "If it keeps failing",
        description:
          "After the maximum attempts the event is parked, not deleted. It appears on the admin status page where an operator can retry it.",
        status: "ok",
      },
    ],
    verdict: "No lost events and no duplicate side effects. The order itself is never affected.",
  },
  {
    id: "optimistic-locking",
    title: "6. Two Admins Editing the Same Product Simultaneously",
    badge: "JPA @Version Locking",
    summary:
      "Admin Alice and Admin Bob open Product #205 at version 3. Alice saves, then Bob tries to save.",
    steps: [
      {
        system: "Client",
        title: "Alice submits version 3",
        description: "Alice updates product description and sends version = 3.",
        status: "ok",
      },
      {
        system: "PostgreSQL",
        title: "Alice update succeeds",
        description:
          "Version is verified as 3. Postgres updates product and increments version to 4.",
        status: "ok",
      },
      {
        system: "Client",
        title: "Bob submits version 3",
        description: "Bob submits price change sending stale version = 3.",
        status: "blocked",
      },
      {
        system: "Backend",
        title: "Backend detects stale version",
        description:
          "ProductService compares Bob's version (3) with DB version (4) and throws OptimisticLockConflictException.",
        status: "blocked",
      },
      {
        system: "Client",
        title: "Bob's UI notifies of conflict",
        description:
          "Bob receives 409 PRODUCT_MODIFIED_BY_ANOTHER_USER; UI reloads Alice's latest changes for review.",
        status: "ok",
      },
    ],
    verdict: "No silent overwrites. Concurrent admin edits are safely coordinated.",
  },
];

export default function ArchitecturePage() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>("concurrent-stock");
  const activeScenario =
    scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-10 text-center">
        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-800 dark:bg-primary-950 dark:text-primary-300">
          System Architecture & Technical Guide
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-stone-900 sm:text-4xl dark:text-stone-50">
          Advanced E-Commerce Architecture
        </h1>
        <p className="mx-auto mt-3 max-w-3xl text-base text-stone-600 dark:text-stone-300">
          Production design showcasing atomic concurrency control, transactional outbox processing,
          Redis caching with cache-aside invalidation, and idempotent checkout resilience.
        </p>
      </div>

      {/* ── Architecture Diagram / Visual Overview ──────────────────────────── */}
      <div className="mb-12 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-50">
          High-Level Architecture & Component Responsibilities
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Modular Monolith with strict separation between performance stores and authoritative databases.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-900 dark:text-blue-300">PostgreSQL</span>
              <span className="rounded bg-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-900 dark:bg-blue-900 dark:text-blue-200">
                Source of Truth
              </span>
            </div>
            <p className="mt-2 text-xs text-blue-800 dark:text-blue-300">
              Authoritative for inventory, orders, prices, users, outbox events, idempotency keys, and audit logs.
            </p>
            <div className="mt-3 space-y-1 text-xs text-stone-600 dark:text-stone-400">
              <div>• Atomic conditional stock decrement</div>
              <div>• Single-transaction multi-item checkout</div>
              <div>• Order item snapshot history</div>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-red-900 dark:text-red-300">Redis</span>
              <span className="rounded bg-red-200 px-2 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-900 dark:text-red-200">
                Performance Store
              </span>
            </div>
            <p className="mt-2 text-xs text-red-800 dark:text-red-300">
              Public product cache, the shopping cart (IDs and quantities only), and shared rate-limit counters. Optional: the shop works without it.
            </p>
            <div className="mt-3 space-y-1 text-xs text-stone-600 dark:text-stone-400">
              <div>• Cache-aside with configurable TTLs</div>
              <div>• AfterCommit cache invalidation</div>
              <div>• Fail-open graceful fallback to DB</div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900 dark:text-amber-300">Outbox</span>
              <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                After-commit events
              </span>
            </div>
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              Events are saved with the order in PostgreSQL and processed right after commit, with retries and de-duplication. No message broker.
            </p>
            <div className="mt-3 space-y-1 text-xs text-stone-600 dark:text-stone-400">
              <div>• Saved in the same transaction as the order</div>
              <div>• Checkout never waits for notifications</div>
              <div>• Exponential backoff, no double processing</div>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 dark:text-emerald-300">Spring Boot</span>
              <span className="rounded bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
                Modular Monolith
              </span>
            </div>
            <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
              Spring Boot 3.3.5 on Java 21. Business logic coordination, optimistic locking, security, and DTO mapping.
            </p>
            <div className="mt-3 space-y-1 text-xs text-stone-600 dark:text-stone-400">
              <div>• JWT & OAuth2 login (Google/FB)</div>
              <div>• Standard HTTP error contract</div>
              <div>• Idempotency key coordination</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Key Implementation Modules & Status ─────────────────────────────── */}
      <div className="mb-12">
        <h2 className="font-display text-2xl font-bold text-stone-900 dark:text-stone-50">
          Core Engineering Guarantees
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Card 1 */}
          <div className="shop-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">Phase 1 & 3</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Implemented
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Atomic Conditional Stock Updates
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Inventory is decremented with conditional SQL (<code>stock &gt;= :quantity</code>). If any item fails, the complete multi-product transaction rolls back. Product IDs are sorted to prevent database deadlocks.
            </p>
          </div>

          {/* Card 2 */}
          <div className="shop-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">Phase 2</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Implemented
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Checkout Idempotency
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Guaranteed by <code>idempotency_records</code> table with unique constraint on <code>(user_id, idempotency_key)</code>. Calculates SHA-256 request hash, coordinates <code>PROCESSING</code>, <code>SUCCEEDED</code>, and <code>FAILED</code> states.
            </p>
          </div>

          {/* Card 3 */}
          <div className="shop-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">Phase 3 & 4</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Implemented
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Redis Caching & Cart
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Cache-aside for products and categories with configurable TTLs. The cart stores product IDs and quantities only (in Redis when configured, otherwise PostgreSQL). Redis carts are temporary and can be lost if Redis restarts without persistence. Current prices and availability are always reconciled from PostgreSQL.
            </p>
          </div>

          {/* Card 4 */}
          <div className="shop-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">Phase 5</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Implemented
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Optimistic Locking (@Version)
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              JPA <code>@Version</code> prevents concurrent admin update collisions. Stale edits return <code>409 PRODUCT_MODIFIED_BY_ANOTHER_USER</code> and the UI prompts the admin to review latest data.
            </p>
          </div>

          {/* Card 5 */}
          <div className="shop-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">Phase 6</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Implemented
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Shared API Rate Limiting
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Fixed-window limits per user (or IP when signed out): login 20 per 15 min per IP plus 8 per account, checkout 10/min, cart changes 90/min, search 150/min. Counters are shared through Redis when it is configured; otherwise each server counts on its own. Returns 429 with a Retry-After header. All limits are environment settings.
            </p>
          </div>

          {/* Card 6 */}
          <div className="shop-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">Phase 7</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Implemented
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Transactional Outbox
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Orders store an <code>ORDER_CREATED</code> event in <code>outbox_events</code> in the same transaction. A background worker claims due events (<code>SKIP LOCKED</code>), runs the handler, and retries failures with backoff. The handler records each event in <code>processed_messages</code> so a repeat never notifies twice. Events that keep failing are parked and shown to admins.
            </p>
          </div>
        </div>
      </div>

      {/* ── Interactive Scenario Studio ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-stone-900 dark:text-stone-50">
              Interactive Concurrency & Failure Simulator
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Select a real-world edge case to inspect how our architecture maintains absolute consistency.
            </p>
          </div>
        </div>

        {/* Scenario Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-4 dark:border-surface-800">
          {scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveScenarioId(s.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeScenarioId === s.id
                  ? "bg-primary-600 text-white shadow-sm"
                  : "bg-surface-100 text-stone-700 hover:bg-surface-200 dark:bg-surface-800 dark:text-stone-300 dark:hover:bg-surface-700"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Selected Scenario Display */}
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-bold text-stone-900 dark:text-stone-50">
              {activeScenario.title}
            </h3>
            <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-800 dark:bg-primary-950 dark:text-primary-300">
              {activeScenario.badge}
            </span>
          </div>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            {activeScenario.summary}
          </p>

          {/* Timeline Steps */}
          <div className="mt-6 space-y-4">
            {activeScenario.steps.map((step, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 rounded-xl border border-stone-100 bg-stone-50/60 p-4 dark:border-surface-800 dark:bg-surface-800/40"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      [{step.system}]
                    </span>
                    <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {step.title}
                    </h4>
                  </div>
                  <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    {step.description}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    step.status === "ok"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : step.status === "blocked"
                      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      : step.status === "fallback"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  }`}
                >
                  {step.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
              System Outcome:
            </span>
            <p className="mt-1 font-medium text-sm text-emerald-900 dark:text-emerald-200">
              {activeScenario.verdict}
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer Link ─────────────────────────────────────────────────────── */}
      <div className="mt-10 text-center">
        <Link
          to="/products"
          className="btn-primary inline-flex items-center gap-2 py-3"
        >
          Explore the Store & Test Live
        </Link>
      </div>
    </div>
  );
}
