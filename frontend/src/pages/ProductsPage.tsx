import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { productApi } from "../api/products";
import type { Category } from "../api/products";
import type { Product } from "../types";
import ProductCard from "../components/product/ProductCard";

const SORTS = [
  { value: "popular", label: "Most Popular" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A-Z" },
  { value: "name-desc", label: "Name: Z-A" },
];

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(Number(searchParams.get("page") || 0));
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") || "");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");
  const [inStock, setInStock] = useState(searchParams.get("inStock") === "true");
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");

  useEffect(() => {
    productApi.getCategories().then((cats) => {
      if (Array.isArray(cats)) setCategories(cats);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const skipPageReset = useRef(true);
  useEffect(() => {
    if (skipPageReset.current) {
      skipPageReset.current = false;
      return;
    }
    setPage(0);
  }, [search, categoryId, minPrice, maxPrice, inStock, sort]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (categoryId) next.set("categoryId", categoryId);
    if (minPrice) next.set("minPrice", minPrice);
    if (maxPrice) next.set("maxPrice", maxPrice);
    if (inStock) next.set("inStock", "true");
    if (sort && sort !== "newest") next.set("sort", sort);
    if (page > 0) next.set("page", String(page));
    setSearchParams(next, { replace: true });
  }, [search, categoryId, minPrice, maxPrice, inStock, sort, page, setSearchParams]);

  useEffect(() => {
    setLoading(true);
    setError("");
    const min = minPrice === "" ? undefined : Number(minPrice);
    const max = maxPrice === "" ? undefined : Number(maxPrice);
    productApi
      .getPage({
        search: search || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        minPrice: min != null && !Number.isNaN(min) ? min : undefined,
        maxPrice: max != null && !Number.isNaN(max) ? max : undefined,
        inStock: inStock ? true : undefined,
        sort,
        page,
        size: 12,
      })
      .then((data) => {
        setProducts(data.content ?? []);
        setTotalPages(data.totalPages ?? 0);
        setTotalElements(data.totalElements ?? 0);
      })
      .catch(() => {
        setError("Unable to load products. Please make sure the server is running.");
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, [search, categoryId, minPrice, maxPrice, inStock, sort, page]);

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setCategoryId("");
    setMinPrice("");
    setMaxPrice("");
    setInStock(false);
    setSort("newest");
  };

  const filtersActive = Boolean(search || categoryId || minPrice || maxPrice || inStock || sort !== "newest");

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="font-display text-3xl font-semibold md:text-4xl">The shop</h1>
        <p className="mb-6 mt-1 text-sm text-stone-600 dark:text-stone-300">Filter by aisle, price, or what’s still on the shelf.</p>

        <div className="shop-card mb-6 space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              type="text"
              placeholder="Search by name or aisle"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="field flex-1"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="field lg:max-w-[12rem]"
            >
              <option value="">All aisles</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="field lg:max-w-[14rem]"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategoryId("")}
                className={`chip ${!categoryId ? "chip-active" : ""}`}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setCategoryId(String(category.id))}
                  className={`chip ${categoryId === String(category.id) ? "chip-active" : ""}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-sm text-stone-600 dark:text-stone-300">Price (MMK)</span>
            <div className="flex min-w-0 items-center gap-2">
              <input
                type="number"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Min"
                className="field w-full sm:w-28"
              />
              <span className="text-stone-500 dark:text-stone-400">—</span>
              <input
                type="number"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max"
                className="field w-full sm:w-28"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
              />
              In stock only
            </label>
            {filtersActive && (
              <button onClick={clearFilters} className="text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
                Clear
              </button>
            )}
          </div>
        </div>

        {!loading && !error && (
          <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
            {totalElements} item{totalElements === 1 ? "" : "s"}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-white/70 dark:bg-surface-800" />
            ))}
          </div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-600">{error}</p>
        ) : products.length === 0 ? (
          <div className="shop-card py-16 text-center">
            <p className="font-display text-xl">Nothing matches that</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">Try another word, or clear the filters.</p>
            <button onClick={clearFilters} className="btn-primary mt-5">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isPopular={sort === "popular" && (product.unitsSold ?? 0) > 0}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="btn-secondary disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-stone-600 dark:text-stone-300">
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="btn-secondary disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
