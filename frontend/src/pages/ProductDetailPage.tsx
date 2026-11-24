import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { productApi } from "../api/products";
import { recommendationsApi } from "../api/recommendations";
import { useCart } from "../context/CartContext";
import RecommendationRail from "../components/product/RecommendationRail";
import ReviewsSection from "../components/reviews/ReviewsSection";
import { Stars } from "../components/ui/Stars";
import { formatMMK } from "../utils/format";
import { productImageSrc } from "../utils/image";
import type { Product, RecommendationItem } from "../types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  const [bought, setBought] = useState<RecommendationItem[]>([]);
  const [related, setRelated] = useState<RecommendationItem[]>([]);
  const [recsLoading, setRecsLoading] = useState(true);

  const loadProduct = useCallback(() => {
    return productApi.getById(productId).then(setProduct).catch(() => setProduct(null));
  }, [productId]);

  // Load the product, report the view, then load recommendations.
  useEffect(() => {
    if (!productId || Number.isNaN(productId)) return;
    setLoading(true);
    setQuantity(1);
    window.scrollTo({ top: 0 });
    loadProduct().finally(() => setLoading(false));
    void recommendationsApi.trackEvent(productId, "VIEW");

    setRecsLoading(true);
    Promise.all([
      recommendationsApi.getFrequentlyBought(productId, 4).catch(() => []),
      recommendationsApi.getRelated(productId, 4).catch(() => []),
    ])
      .then(([together, similar]) => {
        setBought(together);
        // Do not show the same product twice on one page.
        const shown = new Set(together.map((r) => r.product.id));
        setRelated(similar.filter((r) => !shown.has(r.product.id)));
      })
      .finally(() => setRecsLoading(false));
  }, [productId, loadProduct]);

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
          <h1 className="mb-2 font-display text-2xl font-semibold">We don’t have that item</h1>
          <Link to="/products" className="font-semibold text-primary-700 hover:underline dark:text-primary-300">Back to the shop</Link>
        </div>
      </div>
    );
  }

  const soldOut = product.stock <= 0;
  const rating = product.averageRating ?? 0;
  const reviewCount = product.totalReviews ?? 0;

  const add = async () => {
    if (adding || soldOut) return;
    setAdding(true);
    await addItem(product, quantity);
    setAdding(false);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500 dark:text-stone-400" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-primary-700 dark:hover:text-primary-300">Home</Link>
          <span>/</span>
          <Link to="/products" className="hover:text-primary-700 dark:hover:text-primary-300">Shop</Link>
          <span>/</span>
          <span className="min-w-0 break-words text-stone-700 dark:text-stone-200">{product.name}</span>
        </nav>

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="shop-card relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-surface-800 md:aspect-square">
            <img
              src={productImageSrc(product.imageUrl, "https://placehold.co/800x800?text=No+Image")}
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
            <h1 className="mb-2 break-words font-display text-3xl font-semibold">{product.name}</h1>

            <a href="#reviews-heading" className="mb-4 flex w-fit items-center gap-2 hover:underline" aria-label="Jump to reviews">
              <Stars value={rating} size={18} />
              <span className="text-sm font-bold text-stone-800 dark:text-stone-200">{reviewCount > 0 ? rating.toFixed(1) : "No ratings yet"}</span>
              {reviewCount > 0 && (
                <span className="text-xs text-stone-500 dark:text-stone-400">({reviewCount} {reviewCount === 1 ? "review" : "reviews"})</span>
              )}
            </a>

            <p className="mb-6 leading-relaxed text-stone-600 dark:text-stone-300">{product.description}</p>

            <div className="mb-4">
              <span className="font-display text-3xl font-semibold text-primary-700 dark:text-primary-300">{formatMMK(product.price)}</span>
              {product.cargoPrice > 0 && (
                <span className="ml-3 text-sm text-stone-500 dark:text-stone-400">+ {formatMMK(product.cargoPrice)} cargo</span>
              )}
            </div>

            <p className={`text-sm font-medium ${soldOut ? "text-red-700 dark:text-red-300" : "text-accent-700 dark:text-accent-300"} ${product.unitsSold ? "mb-2" : "mb-6"}`}>
              {soldOut ? "Sold out" : product.stock <= 5 ? `Only ${product.stock} left` : `${product.stock} in stock`}
            </p>
            {product.unitsSold != null && product.unitsSold > 0 && (
              <p className="mb-6 text-sm text-stone-600 dark:text-stone-300">{product.unitsSold} sold</p>
            )}

            <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center rounded-full border border-stone-200 bg-white dark:border-surface-800 dark:bg-surface-800">
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-4 py-2 text-lg" aria-label="Decrease quantity">−</button>
                <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{quantity}</span>
                <button onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))} className="px-4 py-2 text-lg" aria-label="Increase quantity">+</button>
              </div>
              <button disabled={soldOut || adding} onClick={() => void add()} className="btn-primary w-full flex-1 py-3">
                {soldOut ? "Sold out" : adding ? "Adding…" : "Add to bag"}
              </button>
            </div>
          </div>
        </div>

        <RecommendationRail
          title="Frequently bought together"
          hint="Customers who bought this also bought these."
          items={bought}
          loading={recsLoading}
          showReasons={false}
          compact
        />

        <RecommendationRail
          title="Related products"
          hint="Similar items you may like."
          items={related}
          loading={recsLoading && related.length === 0}
          compact
        />

        <ReviewsSection productId={productId} onChanged={() => void loadProduct()} />
      </div>
    </div>
  );
}
