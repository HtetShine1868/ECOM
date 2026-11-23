import { useCallback, useEffect, useState } from "react";
import { orderApi } from "../api/orders";
import type { StoreAnalytics } from "../api/orders";
import { formatMMK, formatStatus } from "../utils/format";

const QUICK_RANGES = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "last7", label: "7 days" },
  { value: "last30", label: "30 days" },
  { value: "this_month", label: "This month" },
  { value: "all", label: "All time" },
];

type AnalyticsView = "sales" | "store";

const MORE_RANGES = [
  { value: "yesterday", label: "Yesterday" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
];

const STATUS_BAR: Record<string, string> = {
  PENDING: "bg-amber-400",
  CONFIRMED: "bg-primary-400",
  PROCESSING: "bg-orange-400",
  SHIPPED: "bg-stone-400",
  DELIVERING: "bg-accent-400",
  DELIVERED: "bg-emerald-500",
  CANCELLED: "bg-red-400",
};

function asNumber(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function compactMMK(amount: number) {
  const n = Math.round(amount);
  if (Math.abs(n) >= 1_000_000) {
    const scaled = n / 1_000_000;
    return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    const scaled = n / 1_000;
    return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)}k`;
  }
  return String(n);
}

function share(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export default function AdminAnalytics() {
  const [range, setRange] = useState("last30");
  const [view, setView] = useState<AnalyticsView>("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback((silent = false) => {
    if (range === "custom" && (!from || !to)) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    if (range === "custom" && from > to) {
      setData(null);
      setError("The start date needs to be on or before the end date.");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError("");
    orderApi
      .getAnalytics({ range, from: range === "custom" ? from : undefined, to: range === "custom" ? to : undefined })
      .then((next) => {
        setData(next);
        setUpdatedAt(new Date());
      })
      .catch(() => {
        if (!silent) setError("Analytics could not be loaded.");
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [range, from, to]);

  useEffect(() => {
    load(false);
    const timer = window.setInterval(() => load(true), 15000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const quickActive = QUICK_RANGES.some((option) => option.value === range);
  const revenue = asNumber(data?.totalRevenue);
  const ordersInSales = data?.salesOverTime.reduce((sum, point) => sum + point.orders, 0) ?? 0;
  const statusTotal = data?.statusDistribution.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const peak = data?.salesOverTime.reduce<(typeof data.salesOverTime)[number] | null>(
    (best, point) => (!best || asNumber(point.revenue) > asNumber(best.revenue) ? point : best),
    null,
  );

  return (
    <div className="animate-fade-in space-y-5">
      <header>
        <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-50">Analytics</h2>
        <p className="mt-1 text-sm text-stone-500">
          {data ? `${data.rangeLabel} · ${data.from} to ${data.to}` : "Pick a period to see how the shop is doing."}
          {updatedAt ? ` · updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
      </header>

      <div className="flex flex-col gap-3 border-b border-stone-200 pb-3 dark:border-surface-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1" role="tablist" aria-label="Analytics sections">
          {([
            ["sales", "Sales"],
            ["store", "Store health"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                view === id
                  ? "bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-100"
                  : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-surface-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-full bg-stone-100 p-1 dark:bg-surface-800" role="group" aria-label="Date range">
            {QUICK_RANGES.map((option) => (
              <button
                key={option.value}
                onClick={() => setRange(option.value)}
                aria-pressed={range === option.value}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  range === option.value
                    ? "bg-white text-primary-700 shadow-sm dark:bg-surface-900 dark:text-primary-200"
                    : "text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
            <select
              value={quickActive ? "" : range}
              onChange={(e) => {
                if (e.target.value) setRange(e.target.value);
              }}
              aria-label="More date ranges"
              className={`cursor-pointer rounded-full border-0 py-1.5 pl-3 pr-7 text-sm font-semibold outline-none ${
                quickActive
                  ? "bg-transparent text-stone-600 dark:text-stone-300"
                  : "bg-white text-primary-700 shadow-sm dark:bg-surface-900 dark:text-primary-200"
              }`}
            >
              <option value="">More…</option>
              {MORE_RANGES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {range === "custom" && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="field sm:w-auto" />
              <span className="text-sm text-stone-400">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" className="field sm:w-auto" />
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {range === "custom" && (!from || !to) && !error && (
        <p className="text-sm text-stone-500">Choose a start and end date to see that period.</p>
      )}
      {loading && <div className="h-36 animate-pulse rounded-2xl bg-white dark:bg-surface-800" />}

      {data && !loading && view === "sales" && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric featured label="Revenue" value={formatMMK(revenue)} hint="Confirmed through delivered orders." />
            <Metric
              label="Orders"
              value={String(data.totalOrders)}
              hint={`${data.ordersPlaced ?? data.totalOrders} placed in total. Pending and cancelled orders are not counted.`}
            />
            <Metric label="Average order" value={formatMMK(data.averageOrderValue)} hint="Revenue divided by counted orders." />
            <Metric label="Units sold" value={String(data.unitsSold)} hint="Items on counted orders." />
          </section>

          <section className="shop-card p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-50">Revenue over time</h3>
                <p className="mt-0.5 text-sm text-stone-500">
                  {ordersInSales} orders in the chart
                  {peak && asNumber(peak.revenue) > 0 ? ` · strongest ${peak.label}` : ""}
                </p>
              </div>
              <p className="font-display text-xl font-semibold text-primary-700 dark:text-primary-300">{formatMMK(revenue)}</p>
            </div>
            <SalesChart points={data.salesOverTime} />
          </section>

          <div className="grid gap-4 xl:grid-cols-5">
            <section className="shop-card p-5 xl:col-span-3">
              <h3 className="font-semibold text-stone-900 dark:text-stone-50">Top products</h3>
              <p className="mb-3 mt-0.5 text-sm text-stone-500">Ranked by revenue in this period.</p>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-stone-500">No product sales in this period.</p>
              ) : (
                <ol className="space-y-3">
                  {data.topProducts.map((product, index) => {
                    const pct = share(asNumber(product.revenue), revenue);
                    return (
                      <li key={`${product.name}-${index}`}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium text-stone-900 dark:text-stone-50">
                            <span className="mr-2 inline-block w-4 text-right tabular-nums text-stone-400">{index + 1}</span>
                            {product.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-stone-700 dark:text-stone-200">
                            {formatMMK(product.revenue)}
                            <span className="ml-2 text-xs text-stone-500">{product.unitsSold} sold</span>
                          </span>
                        </div>
                        <ShareBar percent={pct} wide />
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="shop-card p-5 xl:col-span-2">
              <h3 className="font-semibold text-stone-900 dark:text-stone-50">By category</h3>
              <p className="mb-3 mt-0.5 text-sm text-stone-500">Where the revenue came from.</p>
              {data.revenueByCategory.length === 0 ? (
                <p className="text-sm text-stone-500">No category sales in this period.</p>
              ) : (
                <ul className="space-y-3">
                  {data.revenueByCategory.map((row) => {
                    const pct = share(asNumber(row.revenue), revenue);
                    return (
                      <li key={row.category}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">{row.category}</span>
                          <span className="shrink-0 tabular-nums text-stone-600 dark:text-stone-300">{formatMMK(row.revenue)}</span>
                        </div>
                        <ShareBar percent={pct} wide />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {data && !loading && view === "store" && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Metric label="Waiting on you" value={String(data.pendingOrders)} hint="New orders in this period that still need a status change." />
            <Metric label="Delivered" value={String(data.deliveredOrders)} hint="Orders marked delivered in this period." />
            <Metric label="Cancelled" value={String(data.cancelledOrders)} hint={`${data.cancellationRate}% of orders placed · ${formatMMK(data.cancelledRevenue)} not in revenue.`} />
          </section>

          <section className="shop-card p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-50">Order pipeline</h3>
                <p className="mt-0.5 text-sm text-stone-500">{statusTotal} orders placed in this period, every status.</p>
              </div>
              <p className="text-sm text-stone-500">
                Delivered {data.deliveredOrders} · Pending {data.pendingOrders} · Cancelled {data.cancelledOrders} ({data.cancellationRate}%)
              </p>
            </div>
            {statusTotal === 0 ? (
              <p className="text-sm text-stone-500">No orders in this period.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-900">
                  {data.statusDistribution.filter((row) => row.count > 0).map((row) => (
                    <div
                      key={row.status}
                      className={STATUS_BAR[row.status] ?? "bg-stone-400"}
                      style={{ width: `${(row.count / statusTotal) * 100}%` }}
                      title={`${formatStatus(row.status)}: ${row.count}`}
                    />
                  ))}
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {data.statusDistribution.map((row) => (
                    <li key={row.status} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_BAR[row.status] ?? "bg-stone-400"}`} />
                      <span>{formatStatus(row.status)}</span>
                      <span className="tabular-nums text-stone-500">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section>
            <h3 className="mb-3 font-display text-xl font-semibold">Store health</h3>
            <div className="grid gap-4 lg:grid-cols-3">
              <article className="shop-card p-5">
                <h4 className="font-semibold">Customers</h4>
                <dl className="mt-3 space-y-2 text-sm">
                  <Fact label="All customers" value={String(data.totalCustomers)} />
                  <Fact label="Ordered this period" value={String(data.customersWhoOrdered)} />
                  <Fact label="New" value={String(data.newCustomers)} />
                  <Fact label="Returning" value={String(data.returningCustomers)} />
                </dl>
                {data.topCustomers.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-stone-100 pt-3 text-sm dark:border-surface-700">
                    {data.topCustomers.map((customer) => (
                      <li key={customer.name} className="flex items-baseline justify-between gap-3">
                        <span className="truncate">{customer.name}</span>
                        <span className="shrink-0 tabular-nums text-stone-500">
                          {customer.orders} · {formatMMK(customer.spending)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="shop-card p-5">
                <h4 className="font-semibold">Inventory</h4>
                <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">Low stock, {data.lowStockThreshold} or fewer</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.lowStock.length === 0 && <li className="text-stone-500">None</li>}
                  {data.lowStock.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="shrink-0 tabular-nums text-amber-700 dark:text-amber-200">{item.stock}</span>
                    </li>
                  ))}
                </ul>
                <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-stone-500">Out of stock</p>
                <ul className="space-y-1 text-sm">
                  {data.outOfStock.length === 0 && <li className="text-stone-500">None</li>}
                  {data.outOfStock.map((item) => (
                    <li key={item.id}>{item.name}</li>
                  ))}
                </ul>
              </article>

              <article className="shop-card p-5">
                <h4 className="font-semibold">Not in the sales total</h4>
                <dl className="mt-3 space-y-2 text-sm">
                  <Fact label="Cancelled orders" value={String(data.cancelledOrders)} />
                  <Fact label="Cancellation rate" value={`${data.cancellationRate}%`} />
                  <Fact label="Cancelled value" value={formatMMK(data.cancelledRevenue)} />
                </dl>
                {data.frequentlyCancelledProducts.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-stone-100 pt-3 text-sm dark:border-surface-700">
                    {data.frequentlyCancelledProducts.map((product) => (
                      <li key={product.name} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{product.name}</span>
                        <span className="shrink-0 text-stone-500">{product.unitsSold} units</span>
                      </li>
                    ))}
                  </ul>
                )}
                {data.lowPerformingProducts.length > 0 && (
                  <>
                    <p className="mb-2 mt-4 text-xs uppercase tracking-wide text-stone-500">Slow movers</p>
                    <ul className="space-y-1 text-sm">
                      {data.lowPerformingProducts.map((product) => (
                        <li key={product.name} className="flex justify-between gap-3">
                          <span className="truncate">{product.name}</span>
                          <span className="shrink-0 text-stone-500">{product.unitsSold} sold</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  featured = false,
}: {
  label: string;
  value: string;
  hint: string;
  featured?: boolean;
}) {
  return (
    <article className={featured ? "rounded-2xl border border-primary-800 bg-primary-700 p-4 text-white" : "shop-card p-4"}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${featured ? "text-primary-100" : "text-stone-500"}`}>{label}</p>
      <p className={`mt-1 break-words font-display text-2xl font-semibold leading-tight ${featured ? "" : "text-stone-900 dark:text-stone-50"}`}>
        {value}
      </p>
      <p className={`mt-2 text-xs leading-relaxed ${featured ? "text-primary-100" : "text-stone-500"}`}>{hint}</p>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-stone-900 dark:text-stone-50">{value}</dd>
    </div>
  );
}

function ShareBar({ percent, wide = false }: { percent: number; wide?: boolean }) {
  return (
    <div className={`mt-1.5 flex items-center gap-2 ${wide ? "" : "w-28"}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
        <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.max(percent, percent > 0 ? 3 : 0)}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-stone-500">{percent}%</span>
    </div>
  );
}

function SalesChart({ points }: { points: StoreAnalytics["salesOverTime"] }) {
  const amounts = points.map((point) => asNumber(point.revenue));
  const max = Math.max(...amounts, 1);
  const hasSales = amounts.some((amount) => amount > 0);

  if (!hasSales) {
    return <p className="text-sm text-stone-500">No confirmed sales in this period.</p>;
  }

  const labelEvery = points.length > 16 ? Math.ceil(points.length / 8) : 1;
  const plot = 176;

  return (
    <div className="flex gap-3">
      <div className="flex h-44 w-12 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-stone-400">
        <span>{compactMMK(max)}</span>
        <span>{compactMMK(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ minWidth: `${Math.min(points.length, 40) * 36}px` }}>
          <div className="relative border-b border-stone-200 dark:border-surface-700" style={{ height: plot }}>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-stone-200 dark:border-surface-700" />
            <div className={`absolute inset-0 flex items-end gap-2 ${points.length < 12 ? "justify-center" : ""}`}>
              {points.map((point, index) => {
                const amount = asNumber(point.revenue);
                const height = amount <= 0 ? 0 : Math.max(6, (amount / max) * plot);
                return (
                  <div key={`${point.label}-${index}`} className="group flex min-w-8 max-w-14 flex-1 items-end">
                    <div className="relative w-full" style={{ height }}>
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-stone-900 px-2 py-1 text-[11px] text-white group-hover:block">
                        {formatMMK(amount)} · {point.orders} {point.orders === 1 ? "order" : "orders"}
                      </div>
                      <div className="h-full w-full rounded-t-md bg-primary-600 transition-opacity group-hover:opacity-80" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={`mt-2 flex gap-2 ${points.length < 12 ? "justify-center" : ""}`}>
            {points.map((point, index) => (
              <span key={`${point.label}-label-${index}`} className="min-w-8 max-w-14 flex-1 truncate text-center text-[11px] text-stone-500">
                {index % labelEvery === 0 ? point.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
