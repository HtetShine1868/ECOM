import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { orderApi } from "../api/orders";
import { formatMMK, formatDate, getOrderStatusColor } from "../utils/format";
import type { Order } from "../types";

const STORE_NAME = "ShopNow";

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    orderApi
      .getById(Number(id))
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="bg-surface-50 dark:bg-surface-900 min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading receipt...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bg-surface-50 dark:bg-surface-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Order Not Found</h1>
          <Link to="/orders" className="text-primary-500 hover:underline">
            View all orders
          </Link>
        </div>
      </div>
    );
  }

  const handlePrint = () => window.print();

  return (
    <>
      {/* Print-only styles injected via style tag */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-printable, #receipt-printable * { visibility: visible; }
          #receipt-printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="bg-surface-50 dark:bg-surface-900 min-h-screen p-6">
        <div className="mx-auto max-w-2xl">

          {/* Success banner – no-print */}
          <div className="no-print text-center mb-8 animate-fade-in">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-display text-3xl font-bold mb-1">Order Confirmed!</h1>
            <p className="text-gray-400">Your order has been placed successfully.</p>
          </div>

          {/* Receipt Card */}
          <div
            id="receipt-printable"
            className="rounded-2xl bg-white dark:bg-surface-800/50 p-8 shadow-lg animate-fade-in"
          >
            {/* Store header */}
            <div className="text-center mb-6 pb-4 border-b-2 border-dashed border-surface-200 dark:border-surface-700">
              <h2 className="font-display text-3xl font-bold text-primary-600 mb-1">{STORE_NAME}</h2>
              <p className="text-sm text-gray-400">Official Receipt</p>
            </div>

            {/* Order meta */}
            <div className="flex justify-between items-start mb-6 text-sm">
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-200">Order #{order.id}</p>
                <p className="text-gray-400">{formatDate(order.orderDate)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getOrderStatusColor(order.status)}`}>
                {order.status}
              </span>
            </div>

            {/* Customer info */}
            <div className="mb-6 rounded-xl bg-surface-50 dark:bg-surface-900 p-4 space-y-1 text-sm">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Customer Information</h3>
              <p><span className="text-gray-400">Name: </span>{order.customerName}</p>
              {order.customerPhone && (
                <p><span className="text-gray-400">Phone: </span>{order.customerPhone}</p>
              )}
              <p><span className="text-gray-400">Email: </span>{order.customerEmail}</p>
              <p><span className="text-gray-400">Delivery Address: </span>{order.deliveryAddress}</p>
            </div>

            {/* Items */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Ordered Items</h3>
              <div className="divide-y divide-surface-100 dark:divide-surface-800">
                {order.items.map((item) => (
                  <div key={item.id} className="py-3 flex gap-3">
                    {item.productImageUrl && (
                      <img
                        src={item.productImageUrl}
                        alt={item.productName}
                        className="no-print h-12 w-12 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">{item.productName}</span>
                        <span className="font-medium text-sm">{formatMMK(item.lineTotal)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatMMK(item.unitPrice)} × {item.quantity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t-2 border-dashed border-surface-200 dark:border-surface-700 pt-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Products Subtotal</span>
                <span>{formatMMK(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Delivery / Cargo</span>
                <span>{formatMMK(order.cargoTotal)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold pt-2 border-t border-surface-200 dark:border-surface-700">
                <span>TOTAL</span>
                <span className="text-primary-600">{formatMMK(order.total)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center text-xs text-gray-400 border-t border-surface-100 dark:border-surface-800 pt-4">
              Thank you for shopping at {STORE_NAME}!
            </div>
          </div>

          {/* Action buttons – no-print */}
          <div className="no-print mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-6 py-3 text-sm font-semibold text-white shadow-glow hover:bg-primary-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Receipt
            </button>
            <Link
              to="/orders"
              className="flex items-center justify-center gap-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-6 py-3 text-sm font-semibold hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
              View All Orders →
            </Link>
            <Link
              to="/products"
              className="flex items-center justify-center gap-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-6 py-3 text-sm font-semibold hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}