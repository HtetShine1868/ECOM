import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { orderApi } from "../api/orders";
import type { DeliveryZoneApi } from "../api/orders";
import { formatMMK } from "../utils/format";



export default function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Load zones from backend API
  const [zones, setZones] = useState<DeliveryZoneApi[]>([]);
  useEffect(() => {
    orderApi.getActiveDeliveryZones().then((z) => {
      if (Array.isArray(z)) setZones(z);
    }).catch(() => {
      // non-fatal — zones just won'"'"'t show, user can still use custom address
    });
  }, []);

  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [customerPhone, setCustomerPhone] = useState("");

  // Delivery fields
  const [selectedZoneId, setSelectedZoneId] = useState<number | "">("");
  const [otherAddress, setOtherAddress] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const idempotencyKey = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now())
  );
  const [error, setError] = useState("");

  // ── Derived values ─────────────────────────────────────────────────────────
  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) ?? null,
    [zones, selectedZoneId]
  );

  const deliveryFee = selectedZone ? selectedZone.fee : 0;
  const cargoTotal = items.reduce(
    (sum, item) => sum + (item.product.cargoPrice || 0) * item.quantity,
    0
  );
  const grandTotal = totalPrice + cargoTotal + deliveryFee;



  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!customerName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (selectedZoneId === "") {
      setError("Please select a delivery township");
      return;
    }
    if (!otherAddress.trim()) {
      setError("Please enter your specific delivery address (street, block, etc.)");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);
    setError("");
    try {
      const order = await orderApi.create({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        deliveryZoneId: selectedZoneId as number,
        customDeliveryAddress: otherAddress.trim(),
        idempotencyKey: idempotencyKey.current,
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      });
      clearCart();
      navigate("/receipt/" + order.id);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to place order";
      setError(msg);
      submittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  // ── Empty cart guard ────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 font-display text-2xl font-semibold">Your bag is empty</h1>
          <p className="mb-4 text-stone-500">Add something from the shop first.</p>
          <button
            onClick={() => navigate("/products")}
            className="btn-primary"
          >
            Browse the shop
          </button>
        </div>
      </div>
    );
  }



  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 font-display text-3xl font-semibold md:text-4xl">Checkout</h1>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Order Summary ─────────────────────────────────────────────── */}
          <div className="shop-card p-4 sm:p-6">
            <h2 className="font-semibold text-lg mb-4">Order Summary</h2>
            <ul className="divide-y divide-surface-100 dark:divide-surface-800">
              {items.map((item) => (
                <li key={item.product.id} className="flex items-center gap-3 py-3">
                  {item.product.imageUrl && (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.product.name}</p>
                    <p className="text-xs text-gray-400">× {item.quantity}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">
                    {formatMMK(item.product.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-surface-100 dark:border-surface-800 pt-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Products Subtotal</span>
                <span>{formatMMK(totalPrice)}</span>
              </div>
              {cargoTotal > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Cargo</span>
                  <span>{formatMMK(cargoTotal)}</span>
                </div>
              )}

              {/* Town delivery fee line — only visible when a zone is selected */}
              {selectedZone && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-gray-500">
                  <span className="min-w-0">Delivery Fee ({selectedZone.townName})</span>
                  <span className="shrink-0 font-medium text-primary-600">{formatMMK(deliveryFee)}</span>
                </div>
              )}

              <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-surface-100 pt-2 text-lg font-bold dark:border-surface-800">
                <span>Grand Total</span>
                <span className="text-primary-600">{formatMMK(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* ── Customer Information ───────────────────────────────────────── */}
          <div className="shop-card p-4 sm:p-6">
            <h2 className="font-semibold text-lg mb-4">Your Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter your full name"
                  className="field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 09xxxxxxxxx"
                  className="field"
                />
              </div>
            </div>
          </div>

          {/* ── Delivery Location ──────────────────────────────────────────── */}
          <div className="shop-card space-y-4 p-4 sm:p-6">
            <h2 className="font-semibold text-lg">Delivery Location</h2>

            {/* Town dropdown */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Select Your Township <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedZoneId === "" ? "" : String(selectedZoneId)}
                onChange={(e) => {
                  setSelectedZoneId(e.target.value === "" ? "" : Number(e.target.value));
                  setError("");
                }}
                className="field"
              >
                <option value="">— Choose a township —</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.townName} — {formatMMK(z.fee)}
                  </option>
                ))}
              </select>
            </div>

            {/* Delivery fee chip — auto-filled */}
            {selectedZone && (
              <div className="flex items-center gap-2 rounded-xl bg-primary-50 dark:bg-primary-900/20 px-4 py-3 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-primary-700 dark:text-primary-300">
                  Delivery fee for <strong>{selectedZone.townName}</strong>:{" "}
                  <strong>{formatMMK(selectedZone.fee)}</strong>
                </span>
              </div>
            )}

            {/* Address text field — always required */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Specific Location / Street Address <span className="text-red-500">*</span>
              </label>
              <textarea
                value={otherAddress}
                onChange={(e) => setOtherAddress(e.target.value)}
                placeholder="e.g. No. 12, Yadanar Street, Block 4"
                rows={3}
                className="field resize-none p-3"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
              className="btn-primary w-full py-3.5"
          >
            {submitting ? "Placing Order..." : "Confirm Purchase"}
          </button>
        </form>
      </div>
    </div>
  );
}
