import { useEffect, useState } from "react";
import { orderApi } from "../api/orders";
import type { StoreAnalytics } from "../api/orders";
import { formatMMK } from "../utils/format";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

function SalesChart({ points }: { points: StoreAnalytics["salesOverTime"] }) {
  if (points.length === 0) {
    return <p className="text-sm text-gray-400">No completed sales in this period.</p>;
  }
  const max = Math.max(...points.map((point) => Number(point.revenue) || 0), 1);
  return (
    <div className="flex items-end gap-2 h-40 overflow-x-auto">
      {points.map((point) => (
        <div key={point.label} className="flex min-w-14 flex-1 flex-col items-center justify-end h-full">
          <div
            className="w-full rounded-t-lg bg-primary-500"
            style={{ height: `${Math.max(8, (Number(point.revenue) / max) * 100)}%` }}
            title={`${point.orders} orders`}
          />
          <span className="mt-2 text-[10px] text-gray-400 text-center leading-tight">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState("last30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<StoreAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (range === "custom" && (!from || !to)) return;
    setLoading(true);
    setError("");
    orderApi
      .getAnalytics({ range, from: range === "custom" ? from : undefined, to: range === "custom" ? to : undefined })
      .then(setData)
      .catch(() => setError("Analytics could not be loaded."))
      .finally(() => setLoading(false));
  }, [range, from, to]);

  const maxCategory = Math.max(...(data?.revenueByCategory.map((row) => Number(row.revenue)) ?? [1]), 1);
  const maxStatus = Math.max(...(data?.statusDistribution.map((row) => row.count) ?? [1]), 1);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Analytics</h2>
          <p className="text-sm text-gray-400">{data ? `${data.rangeLabel}: ${data.from} to ${data.to}` : "Loading store data"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-4 py-2 text-sm"
          >
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {range === "custom" && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-3 py-2 text-sm" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-3 py-2 text-sm" />
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <div className="h-40 animate-pulse rounded-2xl bg-surface-100 dark:bg-surface-800" />}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Revenue", formatMMK(data.totalRevenue)],
              ["Orders", data.totalOrders],
              ["Units sold", data.unitsSold],
              ["Average order", formatMMK(data.averageOrderValue)],
              ["New customers", data.newCustomers],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-white dark:bg-surface-800/50 p-4 shadow">
                <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-1 text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
            <h3 className="mb-4 font-semibold">Sales over time</h3>
            <SalesChart points={data.salesOverTime} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
              <h3 className="mb-3 font-semibold">Top products</h3>
              {data.topProducts.length === 0 ? <p className="text-sm text-gray-400">No sales yet.</p> : (
                <ul className="space-y-3">
                  {data.topProducts.map((product, index) => (
                    <li key={product.name} className="flex items-center justify-between gap-3 text-sm">
                      <span>{index + 1}. {product.name}</span>
                      <span className="text-right text-gray-500">{product.unitsSold} sold · {formatMMK(product.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
              <h3 className="mb-3 font-semibold">Low performing products</h3>
              <ul className="space-y-3 text-sm">
                {data.lowPerformingProducts.map((product) => (
                  <li key={product.name} className="flex justify-between gap-3">
                    <span>{product.name}</span>
                    <span className="text-gray-500">
                      {product.unitsSold} sold{product.lastSaleDate ? ` · last ${product.lastSaleDate}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
              <h3 className="mb-3 font-semibold">Order status</h3>
              <ul className="space-y-2">
                {data.statusDistribution.map((row) => (
                  <li key={row.status}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{row.status}</span>
                      <span>{row.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-100 dark:bg-surface-800">
                      <div className="h-full rounded-full bg-primary-500" style={{ width: `${(row.count / maxStatus) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
              <h3 className="mb-3 font-semibold">Revenue by category</h3>
              {data.revenueByCategory.length === 0 ? <p className="text-sm text-gray-400">No category sales yet.</p> : (
                <ul className="space-y-2">
                  {data.revenueByCategory.map((row) => (
                    <li key={row.category}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{row.category}</span>
                        <span>{formatMMK(row.revenue)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-100 dark:bg-surface-800">
                        <div className="h-full rounded-full bg-accent-500" style={{ width: `${(Number(row.revenue) / maxCategory) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
              <h3 className="mb-3 font-semibold">Inventory alerts</h3>
              <p className="mb-2 text-xs uppercase text-gray-400">Low stock (≤ {data.lowStockThreshold})</p>
              <ul className="mb-4 space-y-1 text-sm">
                {data.lowStock.length === 0 && <li className="text-gray-400">None</li>}
                {data.lowStock.map((item) => <li key={item.id}>{item.name}: {item.stock} left</li>)}
              </ul>
              <p className="mb-2 text-xs uppercase text-gray-400">Out of stock</p>
              <ul className="space-y-1 text-sm">
                {data.outOfStock.length === 0 && <li className="text-gray-400">None</li>}
                {data.outOfStock.map((item) => <li key={item.id}>{item.name}</li>)}
              </ul>
            </section>

            <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
              <h3 className="mb-3 font-semibold">Customers</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li>Total customers: {data.totalCustomers}</li>
                <li>Ordered in this period: {data.customersWhoOrdered}</li>
                <li>New customers: {data.newCustomers}</li>
                <li>Returning customers: {data.returningCustomers}</li>
              </ul>
              <h4 className="mt-4 mb-2 text-sm font-semibold">Top customers</h4>
              <ul className="space-y-2 text-sm">
                {data.topCustomers.map((customer) => (
                  <li key={customer.name} className="flex justify-between gap-2">
                    <span>{customer.name}</span>
                    <span className="text-gray-500">{customer.orders} orders · {formatMMK(customer.spending)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow">
              <h3 className="mb-3 font-semibold">Cancellations</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li>Cancelled orders: {data.cancelledOrders}</li>
                <li>Cancellation rate: {data.cancellationRate}%</li>
                <li>Cancelled product value: {formatMMK(data.cancelledRevenue)}</li>
                <li>Delivered: {data.deliveredOrders}</li>
                <li>Pending: {data.pendingOrders}</li>
              </ul>
              {data.frequentlyCancelledProducts.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {data.frequentlyCancelledProducts.map((product) => (
                    <li key={product.name}>{product.name} · {product.unitsSold} units</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
