import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { recommendationsApi } from "../../api/recommendations";
import { useCart } from "../../context/CartContext";
import { formatMMK } from "../../utils/format";
import { productImageSrc } from "../../utils/image";
import { Stars } from "../ui/Stars";
import type { RecommendationItem } from "../../types";

/**
 * "You may also like" inside the bag. Based on what is in the bag, what other shoppers bought with it,
 * and the shopper's own interests. Nothing is ever added automatically: every item needs a click.
 */
export default function CartSuggestions({ onNavigate }: { onNavigate: () => void }) {
  const { items, addItem } = useCart();
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);

  // Reload when the set of products in the bag changes (not on every quantity tick).
  const key = items.map((i) => i.product.id).sort((a, b) => a - b).join(",");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    recommendationsApi
      .getForCart(4)
      .then((r) => !cancelled && setRecs(r))
      .catch(() => !cancelled && setRecs([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!loading && recs.length === 0) return null;

  return (
    <section className="mt-6 border-t border-stone-200 pt-4 dark:border-surface-800" aria-label="You may also like">
      <h3 className="font-display text-base font-semibold">You may also like</h3>
      {loading ? (
        <div className="mt-3 space-y-2">{[0, 1].map((n) => <div key={n} className="h-16 animate-pulse rounded-xl bg-stone-100 dark:bg-surface-800" />)}</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {recs.map(({ product, reason }) => (
            <li key={product.id} className="flex items-center gap-3 rounded-xl bg-white p-2 dark:bg-surface-800">
              <Link to={`/products/${product.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3">
                <img src={productImageSrc(product.imageUrl, "https://placehold.co/80x80?text=Item")} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{product.name}</span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-primary-700 dark:text-primary-300">{formatMMK(product.price)}</span>
                    {product.averageRating != null && product.averageRating > 0 && <Stars value={product.averageRating} size={11} />}
                  </span>
                  <span className="block truncate text-[11px] text-stone-500">{reason}</span>
                </span>
              </Link>
              <button
                type="button"
                disabled={adding === product.id}
                onClick={async () => {
                  setAdding(product.id);
                  await addItem(product, 1);
                  setAdding(null);
                }}
                className="shrink-0 rounded-full bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
