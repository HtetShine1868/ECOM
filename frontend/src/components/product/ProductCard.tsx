import { Link } from "react-router-dom";
import type { Product } from "../../types";
import { useCart } from "../../context/CartContext";
import { formatMMK } from "../../utils/format";

interface ProductCardProps {
  product: Product;
  isPopular?: boolean;
}

export default function ProductCard({ product, isPopular }: ProductCardProps) {
  const { addItem } = useCart();

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product, 1);
  };

  const isOutOfStock = product.stock === 0;

  return (
    <Link
      to={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-surface-800/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 animate-fade-in"
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden bg-surface-100 dark:bg-surface-800">
        <img
          src={product.imageUrl ?? "https://placehold.co/400x300?text=No+Image"}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Overlay badges — top-left */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isPopular && (
            <span className="rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-md flex items-center gap-1">
              🔥 Popular
            </span>
          )}
          {product.category && (
            <span className="rounded-full bg-primary-600/80 backdrop-blur-sm px-2.5 py-0.5 text-xs font-semibold text-white">
              {product.category}
            </span>
          )}
        </div>

        {/* Stock overlays — top-right / full overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full bg-red-500 px-4 py-1.5 text-sm font-bold text-white">
              OUT OF STOCK
            </span>
          </div>
        )}
        {!isOutOfStock && product.stock <= 5 && (
          <div className="absolute top-2 right-2">
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">
              Only {product.stock} left
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
          {product.name}
        </h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1">
          {product.description}
        </p>

            {product.unitsSold != null && product.unitsSold > 0 && (
              <p className="mb-2 text-xs font-medium text-orange-500">{product.unitsSold} sold</p>
            )}

            <div className="mt-auto space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
              {formatMMK(product.price)}
            </span>
            {product.cargoPrice > 0 && (
              <span className="text-xs text-gray-400">
                +{formatMMK(product.cargoPrice)} delivery
              </span>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={isOutOfStock}
            className="w-full rounded-xl bg-primary-500 py-2 text-sm font-semibold text-white shadow-glow hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isOutOfStock ? "Out of Stock" : "Add to Cart"}
          </button>
        </div>
      </div>
    </Link>
  );
}