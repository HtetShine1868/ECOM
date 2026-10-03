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
      <div className="bg-surface-50 dark:bg-surface-900 min-h-screen p-6">
        <div className="mx-auto max-w-4xl animate-pulse">
          <div className="h-96 rounded-2xl bg-surface-100 dark:bg-surface-800 mb-6" />
          <div className="h-8 w-2/3 rounded bg-surface-100 dark:bg-surface-800 mb-4" />
          <div className="h-4 w-1/3 rounded bg-surface-100 dark:bg-surface-800" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-surface-50 dark:bg-surface-900 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Product Not Found</h1>
          <Link to="/products" className="text-primary-500 hover:underline">
            Browse all products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-50 dark:bg-surface-900 min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-400">
          <Link to="/" className="hover:text-primary-500">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/products" className="hover:text-primary-500">Products</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-600 dark:text-gray-200">{product.name}</span>
        </nav>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Image */}
          <div className="overflow-hidden rounded-2xl bg-white dark:bg-surface-800">
            <img
              src={product.imageUrl ?? "https://via.placeholder.com/600"}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          </div>

          {/* Info */}
          <div className="flex flex-col">
            {product.category && (
              <span className="mb-2 inline-block w-fit rounded-full bg-primary-100 dark:bg-primary-900/30 px-3 py-1 text-xs font-medium text-primary-700 dark:text-primary-300">
                {product.category}
              </span>
            )}
            <h1 className="font-display text-3xl font-bold mb-3">
              {product.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              {product.description}
            </p>

            <div className="mb-6">
              <span className="text-3xl font-bold text-primary-600">
                {formatMMK(product.price)}
              </span>
              {product.cargoPrice > 0 && (
                <span className="ml-3 text-sm text-gray-400">
                  + {formatMMK(product.cargoPrice)} shipping
                </span>
              )}
            </div>

            <p className={`text-sm font-medium ${product.stock > 0 ? "text-green-600" : "text-red-500"} ${product.unitsSold ? "mb-2" : "mb-6"}`}>
              {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
            </p>
            {product.unitsSold != null && product.unitsSold > 0 && (
              <p className="mb-6 text-sm text-orange-500">{product.unitsSold} sold</p>
            )}

            {/* Quantity + Add to Cart */}
            <div className="flex items-center gap-4 mt-auto">
              <div className="flex items-center rounded-xl border border-surface-100 dark:border-surface-800">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-4 py-2 text-lg hover:bg-surface-100 dark:hover:bg-surface-800 rounded-l-xl transition-colors"
                >
                  −
                </button>
                <span className="px-4 py-2 text-sm font-medium">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  className="px-4 py-2 text-lg hover:bg-surface-100 dark:hover:bg-surface-800 rounded-r-xl transition-colors"
                >
                  +
                </button>
              </div>
              <button
                disabled={product.stock === 0}
                onClick={() => addItem(product, quantity)}
                className="flex-1 rounded-xl bg-primary-500 py-3 text-sm font-semibold text-white shadow-glow hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold mb-4">You may also like</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
