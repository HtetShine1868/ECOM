import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { productApi, bestSellerToProduct } from "../api/products";
import type { Category } from "../api/products";
import type { Product } from "../types";
import ProductCard from "../components/product/ProductCard";

export default function HomePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [popular, setPopular] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      productApi.getBestSellers(8).catch(() => []),
      productApi.getPage({ sort: "newest", page: 0, size: 8 }),
      productApi.getCategories().catch(() => []),
    ])
      .then(([sellers, page, cats]) => {
        setPopular((Array.isArray(sellers) ? sellers : []).map(bestSellerToProduct));
        setRecent(page.content ?? []);
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(() => {
        setError("Unable to load products. Please make sure the server is running.");
      })
      .finally(() => setLoading(false));
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/products?search=${encodeURIComponent(query)}` : "/products");
  };

  return (
    <div className="bg-surface-50 dark:bg-surface-900 min-h-screen">
      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold md:text-5xl">ShopNow</h1>
          <p className="mt-3 text-gray-600 dark:text-gray-300">
            Search, browse, and order with delivery across town.
          </p>
        </div>

        <form onSubmit={submitSearch} className="mx-auto flex max-w-2xl gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
          <button
            type="submit"
            className="rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600"
          >
            Search
          </button>
        </form>

        {categories.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => navigate(`/products?categoryId=${category.id}`)}
                className="rounded-full bg-white dark:bg-surface-800 px-4 py-1.5 text-sm text-gray-600 dark:text-gray-200 shadow-sm hover:text-primary-600"
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {loading ? (
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-12 sm:grid-cols-2 lg:grid-cols-4 md:px-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-surface-100 dark:bg-surface-800" />
          ))}
        </div>
      ) : error ? (
        <p className="pb-16 text-center text-sm text-red-500">{error}</p>
      ) : (
        <div className="mx-auto max-w-7xl space-y-12 px-4 pb-16 md:px-6">
          <section>
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-display text-2xl font-bold">Most Popular</h2>
              <button onClick={() => navigate("/products?sort=popular")} className="text-sm text-primary-500 hover:underline">
                View all
              </button>
            </div>
            {popular.length === 0 ? (
              <p className="text-sm text-gray-400">Popular products appear after customers place orders.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {popular.map((product) => (
                  <ProductCard key={product.id} product={product} isPopular />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-display text-2xl font-bold">Recently Added</h2>
              <button onClick={() => navigate("/products")} className="text-sm text-primary-500 hover:underline">
                Browse products
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400">No products available yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {recent.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
