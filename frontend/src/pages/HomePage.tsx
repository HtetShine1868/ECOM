import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { productApi, bestSellerToProduct } from "../api/products";
import type { Category } from "../api/products";
import type { Product, PageResponse } from "../types";
import ProductCard from "../components/product/ProductCard";
import PopularShowcase from "../components/product/PopularShowcase";
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
    const emptyPage: PageResponse<Product> = { content: [], totalElements: 0, totalPages: 0, size: 0, number: 0 };
    Promise.all([
      productApi.getBestSellers(8).catch(() => []),
      productApi.getPage({ sort: "popular", page: 0, size: 8 }).catch(() => emptyPage),
      productApi.getPage({ sort: "newest", page: 0, size: 8 }),
      productApi.getCategories().catch(() => []),
    ])
      .then(([sellers, ranked, newestPage, cats]) => {
        const fromSales = (Array.isArray(sellers) ? sellers : []).map(bestSellerToProduct);
        const fromRank = ranked.content ?? [];
        const newest = newestPage.content ?? [];
        const picks = fromSales.length > 0 ? fromSales : fromRank.length > 0 ? fromRank : newest;
        setPopular(picks.slice(0, 8));
        setRecent(newest);
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

  const loved = popular.some((product) => (product.unitsSold ?? 0) > 0);
  const popularIds = new Set(popular.map((product) => product.id));
  const fresh = recent.filter((product) => !popularIds.has(product.id)).slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 md:px-6 md:pb-12 md:pt-8">
      <section className="grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300">For the house</p>
          <h1 className="mt-2 font-display text-[2rem] font-semibold leading-[1.12] text-stone-900 sm:text-4xl dark:text-stone-50">
            What do you need today?
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600 sm:text-base dark:text-stone-300">
            Kitchen, kids, and everyday goods that are actually in stock, delivered to your township.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {["Live stock", "Fee before you pay", "Township delivery"].map((item) => (
              <li
                key={item}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200/80 dark:bg-surface-800 dark:text-stone-300 dark:ring-surface-700"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <form
          onSubmit={submitSearch}
          className="rounded-2xl border border-stone-200/80 bg-white p-3 shadow-shop dark:border-surface-800 dark:bg-surface-800/90"
        >
          <label htmlFor="home-search" className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
            Search the shop
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="home-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pans, toys, soap..."
              className="field min-w-0 flex-1"
            />
            <button type="submit" className="btn-primary shrink-0 px-4">
              Search
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate("/products")}
            className="mt-2.5 text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300"
          >
            Browse the whole shop
          </button>
        </form>
      </section>

      {loading ? (
        <div className="mt-8 overflow-hidden rounded-[1.75rem] bg-[#2a1812] px-5 py-6 sm:px-7">
          <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-7 w-48 animate-pulse rounded-full bg-white/10" />
          <div className="mt-5 flex gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className={`h-[22rem] w-[15.5rem] shrink-0 animate-pulse rounded-2xl bg-white/10 sm:w-60 ${
                  slot === 0 ? "" : slot < 3 ? "hidden sm:block" : "hidden lg:block"
                }`}
              />
            ))}
          </div>
        </div>
      ) : error ? (
        <p className="mt-12 text-center text-sm text-red-600">{error}</p>
      ) : popular.length > 0 ? (
        <div className="mt-8">
          <PopularShowcase
            products={popular}
            loved={loved}
            onSeeAll={() => navigate(loved ? "/products?sort=popular" : "/products")}
          />
        </div>
      ) : (
        <div className="mt-10">
          <EmptyShelf message="Products show up here once the shop has something on the shelf." />
        </div>
      )}

      {categories.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold">Aisles</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">Jump to a part of the shop.</p>
            </div>
            <button onClick={() => navigate("/products")} className="shrink-0 text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
              All products
            </button>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {categories.map((category) => (
              <Aisle
                key={category.id}
                name={category.name}
                onClick={() => navigate(`/products?categoryId=${category.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && fresh.length > 0 && (
        <section className="mt-10">
          <SectionHead
            title="Just arrived"
            hint="Newest on the shelf, with in-stock items first."
            action="Browse shop"
            onAction={() => navigate("/products")}
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {fresh.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHead({
  title,
  hint,
  action,
  onAction,
}: {
  title: string;
  hint: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{hint}</p>
      </div>
      <button onClick={onAction} className="shrink-0 text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
        {action}
      </button>
    </div>
  );
}

function EmptyShelf({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-600 dark:border-surface-700 dark:text-stone-300">
      {message}
    </p>
  );
}

function Aisle({ name, onClick }: { name: string; onClick: () => void }) {
  const kind = categoryKind(name);
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-3 rounded-2xl border border-stone-200/80 bg-white px-3 py-2.5 text-left transition hover:border-primary-300 dark:border-surface-800 dark:bg-surface-800/80"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${aisleTone(kind)}`}>
        <AisleMark kind={kind} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-stone-900 dark:text-stone-50">{name}</span>
        <span className="block text-xs text-stone-600 dark:text-stone-300">{categoryLabel(kind)}</span>
      </span>
    </button>
  );
}

function aisleTone(kind: string) {
  switch (kind) {
    case "kids":
      return "bg-apricot-100 text-amber-800";
    case "kitchen":
      return "bg-primary-100 text-primary-800";
    case "food":
      return "bg-accent-100 text-accent-600";
    default:
      return "bg-stone-100 text-stone-700 dark:bg-surface-900 dark:text-stone-200";
  }
}

function AisleMark({ kind }: { kind: string }) {
  const common = "h-5 w-5";
  if (kind === "kids") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3" />
        <path d="M6 19c1.2-3 3.2-4.5 6-4.5S16.8 16 18 19" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "kitchen") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 4v8a3 3 0 0 0 6 0V4" strokeLinecap="round" />
        <path d="M9 12v8M16 4v16" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "food") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 10h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8z" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 8h12l-1 11H7L6 8z" strokeLinejoin="round" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" strokeLinecap="round" />
    </svg>
  );
}
