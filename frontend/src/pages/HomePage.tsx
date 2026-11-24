import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { productApi } from "../api/products";
import { recommendationsApi } from "../api/recommendations";
import type { Category } from "../api/products";
import type { Product, PageResponse, RecommendationItem } from "../types";
import ProductCard from "../components/product/ProductCard";
import RecommendationRail from "../components/product/RecommendationRail";
import { useAuth } from "../context/AuthContext";
import PopularShowcase from "../components/product/PopularShowcase";
import { categoryKind } from "../utils/category";


const iconProps = { className: "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const PROMISES = [
  { title: "Live stock", text: "What you see is what is on the shelf.", icon: <svg {...iconProps}><path d="M20 7 12 3 4 7v10l8 4 8-4V7z" /><path d="m4 7 8 4 8-4M12 11v10" /></svg> },
  { title: "Fee before you pay", text: "Delivery is shown before you place the order.", icon: <svg {...iconProps}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></svg> },
  { title: "Township delivery", text: "Brought to your door, priced by township.", icon: <svg {...iconProps}><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg> },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [popular, setPopular] = useState<Product[]>([]);
  const [recent, setRecent] = useState<Product[]>([]);
  const [forYou, setForYou] = useState<RecommendationItem[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const none: RecommendationItem[] = [];
    Promise.all([
      recommendationsApi.getPopular(8).catch(() => none),
      productApi.getPage({ sort: "newest", page: 0, size: 8 }),
      productApi.getCategories().catch(() => []),
      isAuthenticated ? recommendationsApi.getForYou(8).catch(() => none) : Promise.resolve(none),
      recommendationsApi.getRecentlyViewed(4).catch(() => none),
    ])
      .then(([pop, newestPage, cats, mine, viewed]) => {
        setPopular((Array.isArray(pop) ? pop : []).map((r) => r.product));
        setRecent(newestPage.content ?? []);
        setCategories(Array.isArray(cats) ? cats : []);
        // "For you" is only shown when it really is personalised; otherwise it would just repeat Popular.
        setForYou((Array.isArray(mine) ? mine : []).filter((r) => r.recommendationType === "FOR_YOU"));
        setRecentlyViewed(Array.isArray(viewed) ? viewed : []);
      })
      .catch(() => setError("Unable to load products. Please make sure the server is running."))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/products?search=${encodeURIComponent(query)}` : "/products");
  };

  const loved = popular.some((product) => (product.unitsSold ?? 0) > 0);
  const shownIds = new Set([...popular, ...forYou.map((r) => r.product)].map((product) => product.id));
  const fresh = recent.filter((product) => !shownIds.has(product.id)).slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 md:px-6 md:pb-12 md:pt-8">
      <section className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-shop sm:p-8 dark:border-surface-800 dark:bg-surface-800/60">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300">For the house</p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-stone-900 sm:text-4xl dark:text-stone-50">
              What do you need today?
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-stone-600 sm:text-base dark:text-stone-300">
              Kitchen, kids, and everyday goods that are actually in stock, delivered to your township.
            </p>

            <form
              onSubmit={submitSearch}
              role="search"
              className="mt-5 flex max-w-xl items-center gap-2 rounded-full border border-stone-200 bg-surface-50 p-1.5 pl-4 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/20 dark:border-surface-700 dark:bg-surface-900"
            >
              <svg className="h-4 w-4 shrink-0 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <label htmlFor="home-search" className="sr-only">Search the shop</label>
              <input
                id="home-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pans, toys, rice..."
                className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-stone-400 sm:text-sm"
              />
              <button type="submit" className="btn-primary shrink-0 px-5">Search</button>
            </form>

            {categories.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Browse</span>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => navigate(`/products?categoryId=${category.id}`)}
                    className="chip inline-flex items-center gap-1.5 py-1"
                  >
                    <AisleMark kind={categoryKind(category.name)} small />
                    {category.name}
                  </button>
                ))}
                <button onClick={() => navigate("/products")} className="px-1 text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
                  All products
                </button>
              </div>
            )}
          </div>

          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {PROMISES.map((item) => (
              <li key={item.title} className="flex items-start gap-3 rounded-2xl bg-surface-50 p-3.5 dark:bg-surface-900">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200" aria-hidden="true">
                  {item.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-stone-900 dark:text-stone-50">{item.title}</span>
                  <span className="block text-xs leading-snug text-stone-600 dark:text-stone-300">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {!loading && !error && (
        <>
          <RecommendationRail
            title="Recommended for you"
            hint="Picked from what you have browsed, added and bought."
            items={forYou}
            max={4}
            action={{ label: "Browse shop", onClick: () => navigate("/products") }}
          />
          <RecommendationRail
            title="Recently viewed"
            hint="Pick up where you left off."
            items={recentlyViewed}
            max={4}
            showReasons={false}
          />
        </>
      )}

      {loading ? (
        <div className="mt-6 overflow-hidden rounded-3xl border border-primary-100 bg-primary-50 px-5 py-6 sm:px-7 dark:border-surface-800 dark:bg-surface-800">
          <div className="h-3 w-24 animate-pulse rounded-full bg-stone-200 dark:bg-white/10" />
          <div className="mt-3 h-7 w-48 animate-pulse rounded-full bg-stone-200 dark:bg-white/10" />
          <div className="mt-5 flex gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className={`h-[22rem] w-[15.5rem] shrink-0 animate-pulse rounded-2xl bg-white dark:bg-white/10 sm:w-60 ${
                  slot === 0 ? "" : slot < 3 ? "hidden sm:block" : "hidden lg:block"
                }`}
              />
            ))}
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

function AisleMark({ kind, small = false }: { kind: string; small?: boolean }) {
  const common = small ? "h-4 w-4" : "h-5 w-5";
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
