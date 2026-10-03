import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { orderApi } from "../api/orders";
import { useAuth } from "../context/AuthContext";
import { formatMMK, formatDate, getOrderStatusColor } from "../utils/format";
import type { Order } from "../types";

export default function OrderHistoryPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="bg-surface-50 dark:bg-surface-900 min-h-screen p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-4xl font-bold mb-8">My Orders</h1>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-surface-100 dark:bg-surface-800 h-28" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-20 w-20 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg font-medium">No orders yet</p>
            <p className="mt-1 text-sm mb-6">Start shopping to place your first order</p>
            <Link
              to="/products"
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-semibold text-white shadow-glow hover:bg-primary-600 transition-colors"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <Link
                key={order.id}
                to={"/receipt/" + order.id}
                className="block rounded-2xl bg-white dark:bg-surface-800/50 p-5 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 animate-fade-in"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold">Order #{order.id}</span>
                    <span className="ml-3 text-sm text-gray-400">
                      {formatDate(order.orderDate)}
                    </span>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getOrderStatusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>

                {/* Items preview */}
                <div className="flex items-center gap-2 mb-3 overflow-hidden">
                  {order.items.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center gap-1">
                      {item.productImageUrl && (
                        <img src={item.productImageUrl} alt={item.productName} className="h-8 w-8 rounded object-cover" />
                      )}
                    </div>
                  ))}
                  <span className="text-xs text-gray-400">
                    {order.items.length} {order.items.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{order.deliveryAddress}</span>
                  <span className="font-bold text-primary-600">{formatMMK(order.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}