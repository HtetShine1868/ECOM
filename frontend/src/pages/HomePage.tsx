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
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 md:px-6 md:pt-10">
      <section className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300">For the house</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-[1.08] text-stone-900 sm:text-4xl md:text-5xl dark:text-stone-50">
          What do you need today?
        </h1>
        <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-300">
          Kitchen, kids, and everyday goods that are actually in stock, delivered to your township.
        </p>

        <form onSubmit={submitSearch} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="home-search">Search the shop</label>
          <input
            id="home-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pans, toys, soap..."
            className="field sm:max-w-md"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Search</button>
            <button type="button" onClick={() => navigate("/products")} className="btn-secondary">
              Browse shop
            </button>
          </div>
        </form>

        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600 dark:text-stone-300">
          <li>Live stock</li>
          <li>Fee shown before you pay</li>
          <li>One bag for the house</li>
        </ul>
      </section>

      {loading ? (
        <div className="mt-10 overflow-hidden rounded-[1.75rem] bg-[#2a1812] px-5 py-6 sm:px-7">
          <div className="h-4 w-28 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-8 w-52 animate-pulse rounded-full bg-white/10" />
          <div className="mt-6 flex gap-3">
            <div className="h-64 w-[86%] shrink-0 animate-pulse rounded-2xl bg-white/10 sm:w-[28rem]" />
            <div className="hidden h-64 w-64 shrink-0 animate-pulse rounded-2xl bg-white/10 sm:block" />
            <div className="hidden h-64 w-64 shrink-0 animate-pulse rounded-2xl bg-white/10 lg:block" />
          </div>
        </div>
      ) : error ? (
        <p className="mt-12 text-center text-sm text-red-600">{error}</p>
      ) : popular.length > 0 ? (
        <div className="mt-10">
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
            <h2 className="font-display text-2xl font-semibold">Aisles</h2>
            <button onClick={() => navigate("/products")} className="text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
              All products
            </button>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
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
        <section className="mt-12">
          <SectionHead
            title="Just arrived"
            hint="Newest on the shelf."
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
