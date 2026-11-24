import type { RecommendationItem } from "../../types";
import ProductCard from "./ProductCard";

interface Props {
  title: string;
  hint?: string;
  items: RecommendationItem[];
  loading?: boolean;
  /** Text shown when there is nothing to recommend. Omit to hide the whole section instead. */
  emptyText?: string;
  columns?: "4" | "3";
  action?: { label: string; onClick: () => void };
  /** Show why each item was suggested. */
  showReasons?: boolean;
  compact?: boolean;
  /** Show at most this many (use 4 so a row is never left with one orphan card). */
  max?: number;
}

/** A titled grid of recommended products with loading and empty states. Never auto-adds anything to the bag. */
export default function RecommendationRail({ title, hint, items, loading, emptyText, columns = "4", action, showReasons = true, compact, max }: Props) {
  const shown = max ? items.slice(0, max) : items;
  if (!loading && shown.length === 0 && !emptyText) return null;
  const grid = columns === "3" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-4";

  return (
    <section className={compact ? "mt-6" : "mt-12"} aria-label={title}>
      <div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h2 className={`font-display font-semibold ${compact ? "text-lg" : "text-2xl"}`}>{title}</h2>
          {hint && <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{hint}</p>}
        </div>
        {action && (
          <button onClick={action.onClick} className="shrink-0 text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
            {action.label}
          </button>
        )}
      </div>

      {loading ? (
        <div className={`grid gap-3 sm:gap-4 ${grid}`}>
          {[0, 1, 2, 3].slice(0, columns === "3" ? 3 : 4).map((n) => (
            <div key={n} className="h-72 animate-pulse rounded-2xl bg-stone-100 dark:bg-surface-800" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-600 dark:border-surface-700 dark:text-stone-300">
          {emptyText}
        </p>
      ) : (
        <div className={`grid gap-3 sm:gap-4 ${grid}`}>
          {shown.map((item) => (
            <ProductCard key={item.product.id} product={item.product} reason={showReasons ? item.reason : undefined} />
          ))}
        </div>
      )}
    </section>
  );
}
