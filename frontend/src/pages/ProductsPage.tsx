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
    <div className="bg-surface-50 dark:bg-surface-900 min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="font-display text-4xl font-bold mb-6">All Products</h1>

        <div className="mb-6 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              type="text"
              placeholder="Search by name, description, or category"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-4 py-2.5 text-sm"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-4 py-2.5 text-sm"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">Price (MMK)</span>
            <input
              type="number"
              min="0"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min"
              className="w-28 rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
            />
            <span className="text-gray-400">—</span>
            <input
              type="number"
              min="0"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max"
              className="w-28 rounded-xl border border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
              />
              In stock
            </label>
            {filtersActive && (
              <button onClick={clearFilters} className="text-xs text-primary-500 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {!loading && !error && (
          <p className="mb-4 text-sm text-gray-400">
            {totalElements} product{totalElements === 1 ? "" : "s"} found
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-surface-100 dark:bg-surface-800" />
            ))}
          </div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-500">{error}</p>
        ) : products.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <p className="text-lg font-medium">No products found</p>
            <p className="mt-1 text-sm">Try a different search or clear the filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="rounded-xl bg-white dark:bg-surface-800 px-4 py-2 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-xl bg-white dark:bg-surface-800 px-4 py-2 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
