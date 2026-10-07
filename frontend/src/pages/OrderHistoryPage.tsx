import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { orderApi } from "../api/orders";
import { useAuth } from "../context/AuthContext";
import { formatMMK, formatDate, formatStatus, getOrderStatusColor } from "../utils/format";
import { downloadOrderReceipt } from "../utils/receiptPdf";
import type { Order } from "../types";

export default function OrderHistoryPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    orderApi
      .getAll()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

  const download = async (order: Order) => {
    setDownloadingId(order.id);
    setDownloadError("");
    try {
      const full = order.items?.length ? order : await orderApi.getById(order.id);
      await downloadOrderReceipt(full);
    } catch {
      setDownloadError(`Could not download the receipt for order #${order.id}.`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold md:text-4xl">Your orders</h1>
        <p className="mt-2 text-sm text-stone-500">Open an order, or download its receipt as a PDF.</p>

        {downloadError && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-400/10 dark:text-red-200">
            {downloadError}
          </p>
        )}

        {loading ? (
          <div className="mt-8 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/80 dark:bg-surface-800" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-2xl font-semibold">No orders yet</p>
            <p className="mt-2 text-sm text-stone-500">Your receipts will show up here after checkout.</p>
            <Link to="/products" className="btn-primary mt-6">
              Browse the shop
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {orders.map((order) => (
              <article key={order.id} className="shop-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={"/receipt/" + order.id}
                      className="font-display text-xl font-semibold hover:text-primary-700"
                    >
                      Order #{order.id}
                    </Link>
                    <p className="mt-0.5 text-sm text-stone-500">{formatDate(order.orderDate)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${getOrderStatusColor(order.status)}`}>
                    {formatStatus(order.status)}
                  </span>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-stone-600 dark:text-stone-300">
                  {order.items.slice(0, 3).map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span className="truncate">{item.productName}</span>
                      <span className="shrink-0 tabular-nums text-stone-400">× {item.quantity}</span>
                    </li>
                  ))}
                  {order.items.length > 3 && (
                    <li className="text-xs text-stone-400">+ {order.items.length - 3} more</li>
                  )}
                </ul>

                <div className="mt-4 flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-surface-700">
                  <div className="min-w-0">
                    <p className="break-words text-xs text-stone-500">{order.deliveryAddress}</p>
                    <p className="font-display text-lg font-semibold text-primary-700 dark:text-primary-300">{formatMMK(order.total)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => download(order)}
                      disabled={downloadingId === order.id}
                      className="btn-primary flex-1 sm:flex-none"
                    >
                      {downloadingId === order.id ? "Preparing…" : "Download"}
                    </button>
                    <Link to={"/receipt/" + order.id} className="btn-secondary flex-1 text-center sm:flex-none">
                      View
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
