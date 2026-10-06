import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { productApi, bestSellerToProduct } from "../api/products";
import type { Category } from "../api/products";
import type { Product } from "../types";
import ProductCard from "../components/product/ProductCard";
import { categoryKind, categoryLabel } from "../utils/category";

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
    <div>
      <section className="mx-auto max-w-7xl px-4 pb-6 pt-8 md:px-6 md:pt-12">
        <div className="shop-card overflow-hidden px-5 py-8 md:px-10 md:py-12">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
            For the house
          </p>
          <h1 className="mt-3 max-w-xl font-display text-4xl font-semibold leading-tight text-stone-900 dark:text-stone-50 md:text-5xl">
            Kitchen, kids, and the everyday things you actually use.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-stone-600 dark:text-stone-300">
            Browse what’s in stock, drop it in your bag, and check out with delivery to your township.
          </p>

          <form onSubmit={submitSearch} className="mt-7 flex max-w-xl flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Try pans, toys, soap..."
              className="field"
            />
            <button type="submit" className="btn-primary sm:px-6">
              Find it
            </button>
          </form>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TrustNote title="In-stock first" body="We show live stock so you don’t order empty shelves." />
          <TrustNote title="Town delivery" body="Pick your township at checkout. Fee is shown before you pay." />
          <TrustNote title="Kids to kitchen" body="Daily house things in one bag, not five different shops." />
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-8 md:px-6">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl font-semibold">Shop by aisle</h2>
            <button onClick={() => navigate("/products")} className="text-sm font-semibold text-primary-700 hover:underline">
              See all
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => navigate(`/products?categoryId=${category.id}`)}
                className="shop-card group px-4 py-5 text-left transition hover:-translate-y-0.5 hover:border-primary-300"
              >
                <span className="block font-display text-lg font-semibold text-stone-900 dark:text-stone-50">
                  {category.name}
                </span>
                <span className="mt-1 block text-xs text-stone-500">
                  {categoryLabel(categoryKind(category.name))}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 pb-12 sm:grid-cols-2 lg:grid-cols-4 md:px-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-2xl bg-white/70 dark:bg-surface-800" />
          ))}
        </div>
      ) : error ? (
        <p className="pb-16 text-center text-sm text-red-600">{error}</p>
      ) : (
        <div className="mx-auto max-w-7xl space-y-12 px-4 pb-8 md:px-6">
          <section>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">People keep buying</h2>
                <p className="mt-1 text-sm text-stone-500">The ones that leave the shelf first.</p>
              </div>
              <button onClick={() => navigate("/products?sort=popular")} className="text-sm font-semibold text-primary-700 hover:underline">
                View all
              </button>
            </div>
            {popular.length === 0 ? (
              <p className="text-sm text-stone-500">Popular picks show up after the first orders come in.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {popular.map((product) => (
                  <ProductCard key={product.id} product={product} isPopular />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">Just in</h2>
                <p className="mt-1 text-sm text-stone-500">Newest on the shelf.</p>
              </div>
              <button onClick={() => navigate("/products")} className="text-sm font-semibold text-primary-700 hover:underline">
                Browse shop
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-stone-500">No products available yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

function TrustNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-4 dark:border-surface-800 dark:bg-surface-800/50">
      <p className="font-semibold text-stone-900 dark:text-stone-50">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{body}</p>
    </div>
  );
}
