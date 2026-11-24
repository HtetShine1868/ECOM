import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { recommendationsApi } from "../../api/recommendations";
import { formatMMK } from "../../utils/format";
import { productImageSrc } from "../../utils/image";
import type { CartItem, RecommendationItem } from "../../types";

const UNAVAILABLE_TEXT: Record<string, string> = {
  INACTIVE: "No longer sold",
  REMOVED: "No longer in the shop",
  OUT_OF_STOCK: "Sold out",
  INSUFFICIENT_STOCK: "Not enough in stock",
};

function lineProblem(item: CartItem): string | null {
  const a = item.availability;
  if (!a || a === "IN_STOCK") return null;
  if (a === "INSUFFICIENT_STOCK") return `Only ${item.product.stock} left. Lower the quantity or remove it.`;
  return `${UNAVAILABLE_TEXT[a] ?? "Unavailable"}. Remove it to check out.`;
}

export default function CartDrawer() {
  const {
    items, totalItems, totalPrice, cargoTotal, isOpen, setIsOpen, removeItem, updateQuantity, addItem,
    hasPriceChanges, hasUnavailableItems, acknowledgePrices, loading, error, refresh,
  } = useCart();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<RecommendationItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh(); // always show current prices and stock when the bag opens
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, refresh, setIsOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (items.length > 0) {
      const pId = items[0].product.id;
      recommendationsApi
        .getFrequentlyBought(pId, 3)
        .then((res) => {
          const cartIds = new Set(items.map((i) => i.product.id));
          const filtered = res.filter((r) => !cartIds.has(r.product.id));
          setSuggestions(filtered.slice(0, 2));
        })
        .catch(() => setSuggestions([]));
    } else {
      setSuggestions([]);
    }
  }, [isOpen, items]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-surface-50 shadow-shop animate-slide-in dark:bg-surface-900"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-surface-800">
          <h2 className="font-display text-xl font-semibold">
            Your bag
            {totalItems > 0 && (
              <span className="ml-2 text-sm font-normal text-stone-500">
                ({totalItems} {totalItems === 1 ? "item" : "items"})
              </span>
            )}
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full p-2 hover:bg-white dark:hover:bg-surface-800"
            aria-label="Close bag"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div role="alert" className="mx-5 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}{" "}
            <button onClick={() => void refresh()} className="font-semibold underline">Try again</button>
          </div>
        )}

        {hasPriceChanges && (
          <div role="status" className="mx-5 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">Some prices changed</p>
            <p className="mt-0.5">Check the new prices below, then confirm to continue.</p>
            <button onClick={() => void acknowledgePrices()} className="mt-2 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
              Got it, use the new prices
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && items.length === 0 ? (
            <div className="space-y-3">
              {[0, 1].map((n) => <div key={n} className="h-24 animate-pulse rounded-xl bg-white dark:bg-surface-800" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-stone-500">
              <p className="font-display text-lg">Your bag is empty</p>
              <p className="mt-1 text-sm">Pick something from the shop.</p>
              <button onClick={() => { setIsOpen(false); navigate("/products"); }} className="btn-secondary mt-4">
                Browse the shop
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const problem = lineProblem(item);
                const unavailable = item.availability && item.availability !== "IN_STOCK";
                return (
                  <li
                    key={item.product.id}
                    className={`flex gap-3 rounded-xl bg-white p-3 dark:bg-surface-800 ${unavailable ? "ring-1 ring-red-300 dark:ring-red-800" : ""}`}
                  >
                    <img
                      src={productImageSrc(item.product.imageUrl, "https://placehold.co/80x80?text=Item")}
                      alt=""
                      className={`h-20 w-20 shrink-0 rounded-lg object-cover ${unavailable ? "opacity-50 grayscale" : ""}`}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{item.product.name}</h3>
                      <p className="mt-0.5 text-sm font-medium text-primary-700 dark:text-primary-300">
                        {formatMMK(item.product.price)}
                        {item.priceChanged && item.previousPrice != null && (
                          <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                            was <s>{formatMMK(item.previousPrice)}</s>
                          </span>
                        )}
                      </p>
                      {problem && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{problem}</p>}
                      {item.availability !== "REMOVED" && item.availability !== "INACTIVE" && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => void updateQuantity(item.product.id, item.quantity - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-sm hover:bg-surface-50 dark:border-surface-700"
                            aria-label={`Decrease ${item.product.name}`}
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-medium" aria-live="polite">{item.quantity}</span>
                          <button
                            onClick={() => void updateQuantity(item.product.id, item.quantity + 1)}
                            disabled={item.quantity >= item.product.stock}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 text-sm hover:bg-surface-50 disabled:opacity-30 dark:border-surface-700"
                            aria-label={`Increase ${item.product.name}`}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => void removeItem(item.product.id)}
                      className="self-start p-1 text-stone-400 transition-colors hover:text-red-500"
                      aria-label={`Remove ${item.product.name}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {suggestions.length > 0 && (
            <div className="mt-6 border-t border-stone-200 pt-4 dark:border-surface-800">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500">
                You May Also Like
              </h3>
              <div className="space-y-2">
                {suggestions.map((sug) => (
                  <div
                    key={sug.product.id}
                    className="flex items-center justify-between rounded-xl border border-stone-200/80 bg-white p-2.5 dark:border-surface-800 dark:bg-surface-800/80"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={productImageSrc(sug.product.imageUrl, "https://placehold.co/64x64?text=Item")}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{sug.product.name}</p>
                        <p className="text-[11px] font-bold text-primary-700 dark:text-primary-300">
                          {formatMMK(sug.product.price)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => void addItem(sug.product, 1)}
                      className="ml-2 shrink-0 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-800 hover:bg-primary-200 dark:bg-primary-950 dark:text-primary-200"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-3 border-t border-stone-200 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 dark:border-surface-800">
            <div className="space-y-1 text-sm text-stone-600 dark:text-stone-300">
              <div className="flex justify-between"><span>Products</span><span>{formatMMK(totalPrice)}</span></div>
              {cargoTotal > 0 && <div className="flex justify-between"><span>Cargo</span><span>{formatMMK(cargoTotal)}</span></div>}
              <p className="text-xs text-stone-500">Delivery fee is added at checkout. Prices are confirmed when you place the order.</p>
            </div>
            {hasUnavailableItems && (
              <p className="text-xs font-medium text-red-700 dark:text-red-300">Remove or fix the highlighted items to continue.</p>
            )}
            <button
              disabled={hasUnavailableItems || hasPriceChanges}
              onClick={() => { setIsOpen(false); navigate("/checkout"); }}
              className="btn-primary w-full py-3"
            >
              Checkout
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
