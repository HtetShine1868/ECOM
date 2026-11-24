import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { orderApi } from "../api/orders";
import type { DeliveryZoneApi } from "../api/orders";
import { formatMMK } from "../utils/format";
import { productImageSrc } from "../utils/image";
import { isMyanmarPhone, nationalPhoneDigits, toMyanmarPhone } from "../utils/phone";
import type { ApiError } from "../api/client";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Errors where the same attempt can safely be tried again with the same key. */
function isRetryableWithSameKey(err: ApiError) {
  return err.status === undefined || err.status >= 500 || err.code === "CHECKOUT_IN_PROGRESS";
}

function describeError(err: ApiError): { message: string; refreshCart: boolean } {
  switch (err.code) {
    case "PRICE_CHANGED":
      return { message: "Some prices changed. Check the new prices below and confirm them to continue.", refreshCart: true };
    case "INSUFFICIENT_STOCK": {
      const name = err.details?.productName;
      const left = err.details?.availableStock;
      const what = name ? `"${name}"` : "One of your items";
      return {
        message:
          left > 0
            ? `${what} has only ${left} left. Lower the quantity in your bag, then try again.`
            : `${what} just sold out. Remove it from your bag, then try again.`,
        refreshCart: true,
      };
    }
    case "PRODUCT_UNAVAILABLE":
      return { message: `${err.details?.productName ? `"${err.details.productName}"` : "An item"} is no longer sold. Remove it from your bag to continue.`, refreshCart: true };
    case "CHECKOUT_IN_PROGRESS":
      return { message: "Your order is still being placed. Wait a few seconds and tap the button again. You will not be charged twice.", refreshCart: false };
    case "RATE_LIMITED":
      return { message: `Too many attempts. Please wait ${err.details?.retryAfterSeconds ?? "a few"} seconds and try again.`, refreshCart: false };
    case "IDEMPOTENCY_KEY_REUSED":
      return { message: "Your order changed since the last try. Please tap the button again.", refreshCart: false };
    default:
      if (err.status === undefined || err.status >= 500) {
        return { message: "We could not confirm your order because of a connection problem. Tap the button again: the same attempt is reused, so you will not get a second order.", refreshCart: false };
      }
      return { message: err.message || "Your order could not be placed.", refreshCart: false };
  }
}

export default function CheckoutPage() {
  const {
    items, totalPrice, cargoTotal, hasPriceChanges, hasUnavailableItems,
    acknowledgePrices, refresh, removeItem, loading, setIsOpen,
  } = useCart();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [zones, setZones] = useState<DeliveryZoneApi[]>([]);
  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState<number | "">("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  // One key per checkout attempt. Kept for retries of the same order; replaced when the order changes.
  const attempt = useRef<{ key: string; fingerprint: string } | null>(null);

  useEffect(() => {
    orderApi.getActiveDeliveryZones().then((z) => Array.isArray(z) && setZones(z)).catch(() => undefined);
    void refresh();
  }, [refresh]);

  const selectedZone = useMemo(() => zones.find((z) => z.id === selectedZoneId) ?? null, [zones, selectedZoneId]);
  const deliveryFee = selectedZone ? selectedZone.fee : 0;
  const grandTotal = totalPrice + cargoTotal + deliveryFee;
  const blocked = hasPriceChanges || hasUnavailableItems;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!isAuthenticated) return navigate("/login");
    if (!user?.emailVerified) {
      return navigate("/verify-email");
    }
    if (blocked) return setError("Fix the items marked below before placing your order.");
    if (!customerName.trim()) return setError("Please enter your name.");
    const customerPhone = toMyanmarPhone(phoneDigits);
    if (!isMyanmarPhone(customerPhone)) return setError("Enter a phone number like +959123456789 (digits only after +95).");
    if (selectedZoneId === "") return setError("Please choose your township.");
    if (!address.trim()) return setError("Please enter your street address.");

    const lines = items.map((i) => ({
      productId: i.product.id,
      quantity: i.quantity,
      expectedUnitPrice: i.product.price,
      expectedCargoPrice: i.cargoPrice ?? i.product.cargoPrice,
    }));
    const fingerprint = JSON.stringify([
      customerName.trim(), customerPhone, selectedZoneId, address.trim(),
      lines.map((l) => `${l.productId}:${l.quantity}`).sort(),
    ]);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { key: newKey(), fingerprint };
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const order = await orderApi.create({
        customerName: customerName.trim(),
        customerPhone,
        deliveryZoneId: selectedZoneId,
        customDeliveryAddress: address.trim(),
        idempotencyKey: attempt.current.key,
        items: lines,
      });
      attempt.current = null;
      await refresh();
      navigate("/receipt/" + order.id);
    } catch (err) {
      const apiErr = err as ApiError;
      if (!isRetryableWithSameKey(apiErr)) attempt.current = null; // a new decision needs a new attempt
      const { message, refreshCart } = describeError(apiErr);
      setError(message);
      if (refreshCart) await refresh();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!loading && items.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="mb-2 font-display text-2xl font-semibold">Your bag is empty</h1>
          <p className="mb-4 text-stone-500">Add something from the shop first.</p>
          <Link to="/products" className="btn-primary">Browse the shop</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 font-display text-3xl font-semibold md:text-4xl">Checkout</h1>

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <section className="shop-card space-y-4 p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Your details</h2>
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium">Full name</label>
                <input id="name" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your full name" className="field" autoComplete="name" />
              </div>
              <div>
                <label htmlFor="customer-phone" className="mb-1.5 block text-sm font-medium">Phone number</label>
                <div className="flex min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/20 dark:border-surface-800 dark:bg-surface-800">
                  <span className="flex shrink-0 items-center border-r border-stone-200 px-3 text-sm font-semibold text-stone-700 dark:border-surface-700 dark:text-stone-100">+95</span>
                  <input
                    id="customer-phone" type="tel" inputMode="numeric" autoComplete="tel-national" required
                    pattern="[1-9][0-9]{6,10}" maxLength={11} value={phoneDigits}
                    onChange={(e) => setPhoneDigits(nationalPhoneDigits(e.target.value))}
                    placeholder="9123456789"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-stone-400 sm:text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="shop-card space-y-4 p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Delivery</h2>
              <div>
                <label htmlFor="zone" className="mb-1.5 block text-sm font-medium">Township</label>
                <select id="zone" required value={selectedZoneId === "" ? "" : String(selectedZoneId)}
                  onChange={(e) => { setSelectedZoneId(e.target.value === "" ? "" : Number(e.target.value)); setError(""); }}
                  className="field">
                  <option value="">Choose a township</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.townName} · {formatMMK(z.fee)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="address" className="mb-1.5 block text-sm font-medium">Street address</label>
                <textarea id="address" required value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. No. 12, Yadanar Street, Block 4" rows={3} className="field resize-none p-3" />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="shop-card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Order summary</h2>
                <button type="button" onClick={() => setIsOpen(true)} className="text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">Edit bag</button>
              </div>

              {hasPriceChanges && (
                <div role="alert" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">Prices changed since you added these</p>
                  <ul className="mt-1 space-y-0.5">
                    {items.filter((i) => i.priceChanged).map((i) => (
                      <li key={i.product.id}>
                        {i.product.name}: {i.previousPrice != null ? <s>{formatMMK(i.previousPrice)}</s> : null}{" "}
                        <strong>{formatMMK(i.product.price)}</strong>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => void acknowledgePrices()} className="mt-2 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
                    Accept the new prices
                  </button>
                </div>
              )}

              <ul className="divide-y divide-stone-100 dark:divide-surface-800">
                {items.map((item) => {
                  const bad = item.availability && item.availability !== "IN_STOCK";
                  return (
                    <li key={item.product.id} className="flex items-center gap-3 py-3">
                      <img src={productImageSrc(item.product.imageUrl, "https://placehold.co/96x96?text=Item")} alt="" className={`h-12 w-12 shrink-0 rounded-lg object-cover ${bad ? "opacity-50 grayscale" : ""}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.product.name}</p>
                        <p className="text-xs text-stone-500">
                          {formatMMK(item.product.price)} × {item.quantity}
                        </p>
                        {bad && (
                          <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                            {item.availability === "INSUFFICIENT_STOCK" ? `Only ${item.product.stock} left` : item.availability === "OUT_OF_STOCK" ? "Sold out" : "No longer sold"}
                            {" · "}
                            <button type="button" onClick={() => void removeItem(item.product.id)} className="font-semibold underline">Remove</button>
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-medium">{bad ? "-" : formatMMK(item.product.price * item.quantity)}</span>
                    </li>
                  );
                })}
              </ul>

              <dl className="mt-3 space-y-1.5 border-t border-stone-100 pt-3 text-sm dark:border-surface-800">
                <div className="flex justify-between text-stone-600 dark:text-stone-300"><dt>Products</dt><dd>{formatMMK(totalPrice)}</dd></div>
                {cargoTotal > 0 && <div className="flex justify-between text-stone-600 dark:text-stone-300"><dt>Cargo</dt><dd>{formatMMK(cargoTotal)}</dd></div>}
                <div className="flex justify-between text-stone-600 dark:text-stone-300">
                  <dt>Delivery{selectedZone ? ` (${selectedZone.townName})` : ""}</dt>
                  <dd>{selectedZone ? formatMMK(deliveryFee) : "Choose a township"}</dd>
                </div>
                <div className="flex justify-between border-t border-stone-100 pt-2 text-lg font-bold dark:border-surface-800">
                  <dt>Total</dt><dd className="text-primary-700 dark:text-primary-300">{formatMMK(grandTotal)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-stone-500">The final total is calculated by the shop when you place the order.</p>
            </section>

            {error && (
              <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>
            )}

            {!user?.emailVerified ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-left dark:border-amber-700/60 dark:bg-amber-950/30">
                <p className="font-semibold text-amber-900 dark:text-amber-200">Email Verification Required</p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  Please verify your email address to complete checkout.
                </p>
                <Link to="/verify-email" className="btn-primary mt-3 block w-full py-2.5 text-center text-xs">
                  Verify Email to Continue
                </Link>
              </div>
            ) : (
              <button type="submit" disabled={submitting || blocked || loading} className="btn-primary w-full py-3.5">
                {submitting ? "Placing your order..." : "Place order"}
              </button>
            )}
            {blocked && !submitting && (
              <p className="text-center text-xs text-stone-500">
                {hasUnavailableItems ? "Remove the unavailable items to continue." : "Accept the new prices to continue."}
              </p>
            )}
          </aside>
        </form>
      </div>
    </div>
  );
}
