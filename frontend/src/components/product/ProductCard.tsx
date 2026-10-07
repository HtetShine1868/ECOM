import { useState } from "react";
import { Link } from "react-router-dom";
import type { Product } from "../../types";
import { useCart } from "../../context/CartContext";
import { formatMMK } from "../../utils/format";
import { categoryChipClass } from "../../utils/category";

interface ProductCardProps {
  product: Product;
  isPopular?: boolean;
}

export default function ProductCard({ product, isPopular }: ProductCardProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const isOutOfStock = product.stock === 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product, 1);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <Link
      to={`/products/${product.id}`}
      className="shop-card group flex min-w-0 flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-primary-300"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-primary-50 dark:bg-surface-800">
        <img
          src={product.imageUrl ?? "https://placehold.co/400x500?text=No+Image"}
          alt={product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {isPopular && (
            <span className="rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-bold text-primary-800">
              Popular
            </span>
          )}
          {product.category && (
            <span className={`max-w-[8.5rem] truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${categoryChipClass(product.category)}`}>
              {product.category}
            </span>
          )}
        </div>
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-900/45">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-800">
              Sold out
            </span>
          </div>
        )}
        {!isOutOfStock && product.stock <= 5 && (
          <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
            {product.stock} left
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900 sm:text-base dark:text-stone-50">
          {product.name}
        </h3>
        <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-stone-600 dark:text-stone-300">
          {product.description}
        </p>
        {product.unitsSold != null && product.unitsSold > 0 && (
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{product.unitsSold} sold</p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-primary-700 dark:text-primary-300 sm:text-lg">
              {formatMMK(product.price)}
            </p>
            {product.cargoPrice > 0 && (
              <p className="truncate text-[11px] text-stone-500 dark:text-stone-400">+{formatMMK(product.cargoPrice)} cargo</p>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={isOutOfStock}
            className={`w-full rounded-full px-3 py-2 text-xs font-bold text-white transition ${
              added
                ? "bg-accent-500"
                : "bg-primary-600 shadow-glow hover:bg-primary-700"
            } disabled:opacity-40 disabled:shadow-none`}
          >
            {isOutOfStock ? "Sold out" : added ? "Added" : "Add"}
          </button>
        </div>
      </div>
    </Link>
  );
}
