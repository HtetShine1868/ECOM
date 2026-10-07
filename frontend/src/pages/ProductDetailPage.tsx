import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { productApi } from "../api/products";
import { useCart } from "../context/CartContext";
import ProductCard from "../components/product/ProductCard";
import { formatMMK } from "../utils/format";
import type { Product } from "../types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setRelated([]);
    productApi
      .getById(Number(id))
      .then((item) => {
        setProduct(item);
        return productApi.getRelated(item.id).catch(() => []);
      })
      .then((items) => setRelated(Array.isArray(items) ? items : []))
      .catch(() => {
        setProduct(null);
        setRelated([]);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl animate-pulse">
          <div className="mb-6 h-96 rounded-2xl bg-white/70 dark:bg-surface-800" />
          <div className="mb-4 h-8 w-2/3 rounded bg-white/70 dark:bg-surface-800" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold mb-2">We don’t have that item</h1>
          <Link to="/products" className="font-semibold text-primary-700 hover:underline dark:text-primary-300">
            Back to the shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500 dark:text-stone-400">
          <Link to="/" className="hover:text-primary-700 dark:hover:text-primary-300">Home</Link>
          <span>/</span>
          <Link to="/products" className="hover:text-primary-700 dark:hover:text-primary-300">Shop</Link>
          <span>/</span>
          <span className="min-w-0 break-words text-stone-700 dark:text-stone-200">{product.name}</span>
        </nav>

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="shop-card relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-surface-800 md:aspect-square">
            <img
              src={product.imageUrl?.trim() || "https://placehold.co/800x800?text=No+Image"}
              alt={product.name}
              className="absolute inset-0 h-full w-full object-cover object-center"
              onError={(event) => {
                const img = event.currentTarget;
                if (img.dataset.fallback === "1") return;
                img.dataset.fallback = "1";
                img.src = "https://placehold.co/800x800?text=No+Image";
              }}
            />
          </div>

          <div className="flex flex-col">
            {product.category && (
              <span className="mb-2 inline-block w-fit rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/40 dark:text-primary-100">
                {product.category}
              </span>
            )}
            <h1 className="mb-3 break-words font-display text-3xl font-semibold">
              {product.name}
            </h1>
            <p className="mb-6 leading-relaxed text-stone-600 dark:text-stone-300">
              {product.description}
            </p>

            <div className="mb-4">
              <span className="font-display text-3xl font-semibold text-primary-700 dark:text-primary-300">
                {formatMMK(product.price)}
              </span>
              {product.cargoPrice > 0 && (
                <span className="ml-3 text-sm text-stone-500 dark:text-stone-400">
                  + {formatMMK(product.cargoPrice)} cargo
                </span>
              )}
            </div>

            <p className={`text-sm font-medium ${product.stock > 0 ? "text-accent-700 dark:text-accent-300" : "text-red-700 dark:text-red-300"} ${product.unitsSold ? "mb-2" : "mb-6"}`}>
              {product.stock > 0 ? `${product.stock} in stock` : "Sold out"}
            </p>
            {product.unitsSold != null && product.unitsSold > 0 && (
              <p className="mb-6 text-sm text-stone-600 dark:text-stone-300">{product.unitsSold} sold</p>
            )}

            <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center rounded-full border border-stone-200 bg-white dark:border-surface-800 dark:bg-surface-800">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-4 py-2 text-lg"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  className="px-4 py-2 text-lg"
                >
                  +
                </button>
              </div>
              <button
                disabled={product.stock === 0}
                onClick={() => addItem(product, quantity)}
                className="btn-primary w-full flex-1 py-3"
              >
                Add to bag
              </button>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 font-display text-2xl font-semibold">Goes well with</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
