import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { productApi } from "../api/products";
import type { Category as ApiCategory } from "../api/products";
import { orderApi } from "../api/orders";
import type { DeliveryZoneApi } from "../api/orders";
import { formatMMK, formatDate, getOrderStatusColor, ORDER_STATUSES } from "../utils/format";
import AdminAnalytics from "./AdminAnalytics";


import type { Product, Order } from "../types";

type Tab = "dashboard" | "products" | "orders" | "order-detail" | "analytics" | "settings";

interface ProductFormState {
  name: string;
  description: string;
  price: string;
  stock: string;
  cargoPrice: string;
  category: string;
}

const emptyForm: ProductFormState = {
  name: "",
  description: "",
  price: "",
  stock: "",
  cargoPrice: "",
  category: "",
};

// ─── Analytics helpers ────────────────────────────────────────────────────────
function ActionCard({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shop-card p-4 text-left shadow-shop transition hover:-translate-y-0.5 hover:border-primary-300"
    >
      <p className="font-semibold text-stone-900 dark:text-stone-50">{title}</p>
      <p className="mt-1 text-sm text-stone-500">{detail}</p>
    </button>
  );
}

function Pulse({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-100 px-3 py-3 dark:bg-surface-950">
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold text-stone-900 dark:text-stone-50">{value}</dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
        active
          ? "bg-primary-600 text-white shadow-shop"
          : "border border-stone-200 bg-white text-stone-800 hover:border-primary-400 hover:text-primary-700 dark:border-surface-700 dark:bg-surface-800 dark:text-stone-100 dark:hover:text-primary-200"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("dashboard");

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [freshOrders, setFreshOrders] = useState<Order[]>([]);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const knownOrderIds = useRef<Set<number> | null>(null);

  // Selected order detail
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  // Product form state
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // ── Category Manager state ─────────────────────────────────────────────────
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [catError, setCatError] = useState("");

  // ── Delivery Zone state ────────────────────────────────────────────────────
  const [zones, setZones] = useState<DeliveryZoneApi[]>([]);
  const [newZoneTown, setNewZoneTown] = useState("");
  const [newZoneFee, setNewZoneFee] = useState("");
  const [editingZone, setEditingZone] = useState<DeliveryZoneApi | null>(null);
  const [zoneError, setZoneError] = useState("");

  // ── Analytics state ────────────────────────────────────────────────────────
  // ── Auth guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, authLoading, navigate]);

  // ── Load localStorage data ──────────────────────────────────────────────────



  // ── Data loading ───────────────────────────────────────────────────────────

  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    productApi
      .getAll()
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, []);

  const loadOrders = useCallback((silent = false) => {
    if (!silent) setOrdersLoading(true);
    orderApi
      .getAllAdmin()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setOrders(list);
        setOrdersError("");
        if (knownOrderIds.current) {
          const arrived = list.filter((order) => !knownOrderIds.current?.has(order.id));
          if (arrived.length > 0) setFreshOrders(arrived);
        }
        knownOrderIds.current = new Set(list.map((order) => order.id));
      })
      .catch(() => {
        setOrdersError("Orders could not be loaded. Refresh to try again.");
        if (!silent) setOrders([]);
      })
      .finally(() => {
        if (!silent) setOrdersLoading(false);
      });
  }, []);

  const loadCategories = useCallback(() => {
    productApi
      .getCategories()
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  const loadZones = useCallback(() => {
    orderApi
      .getAllDeliveryZonesAdmin()
      .then((data) => setZones(Array.isArray(data) ? data : []))
      .catch(() => setZones([]));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadProducts();
    loadOrders();
    loadCategories();
    loadZones();
  }, [isAdmin, loadProducts, loadOrders, loadCategories, loadZones]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setInterval(() => loadOrders(true), 12000);
    const onFocus = () => loadOrders(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAdmin, loadOrders]);

  useEffect(() => {
    const raw = searchParams.get("order");
    if (!raw || orders.length === 0) return;
    const found = orders.find((order) => order.id === Number(raw));
    if (!found) return;
    setSelectedOrder(found);
    setNewStatus(found.status);
    setTab("order-detail");
    const next = new URLSearchParams(searchParams);
    next.delete("order");
    setSearchParams(next, { replace: true });
  }, [orders, searchParams, setSearchParams]);

  // ── Computed stats ─────────────────────────────────────────────────────────

  const stats = {
    totalProducts: products.length,
    totalOrders: orders.length,
    pending: orders.filter((o) => o.status === "PENDING").length,
    processing: orders.filter((o) => o.status === "PROCESSING").length,
    delivered: orders.filter((o) => o.status === "DELIVERED").length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
  };

  // ── Analytics computation ──────────────────────────────────────────────────


  // ── Category Manager helpers ────────────────────────────────────────────────

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) { setCatError("Please enter a category name."); return; }
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setCatError("Category already exists."); return;
    }
    try {
      await productApi.createCategory({ name });
      setNewCategoryName("");
      setCatError("");
      loadCategories();
    } catch (err: any) {
      setCatError(err?.message || "Failed to create category");
    }
  }

  async function deleteCategory(id: number) {
    try {
      await productApi.deleteCategory(id);
      loadCategories();
    } catch {
      alert("Failed to delete category");
    }
  }

  // ── Delivery Zone helpers ───────────────────────────────────────────────────

  async function addZone() {
    const town = newZoneTown.trim();
    const fee = parseFloat(newZoneFee);
    if (!town) { setZoneError("Please enter a town name."); return; }
    if (isNaN(fee) || fee < 0) { setZoneError("Please enter a valid fee."); return; }
    if (zones.some((z) => z.townName.toLowerCase() === town.toLowerCase())) {
      setZoneError("Town already exists."); return;
    }
    try {
      await orderApi.createDeliveryZone({ townName: town, fee, isActive: true });
      setNewZoneTown("");
      setNewZoneFee("");
      setZoneError("");
      loadZones();
    } catch (err: any) {
      setZoneError(err?.message || "Failed to create delivery zone");
    }
  }

  async function deleteZone(id: number) {
    try {
      await orderApi.deleteDeliveryZone(id);
      loadZones();
    } catch {
      alert("Failed to delete zone");
    }
  }

  function startEditZone(zone: DeliveryZoneApi) {
    setEditingZone({ ...zone });
  }

  async function saveEditZone() {
    if (!editingZone) return;
    try {
      await orderApi.updateDeliveryZone(editingZone.id, {
        townName: editingZone.townName,
        fee: editingZone.fee,
        isActive: editingZone.isActive
      });
      setEditingZone(null);
      loadZones();
    } catch {
      alert("Failed to update zone");
    }
  }

  // ── Product form helpers ───────────────────────────────────────────────────

  function openAddForm() {
    setEditingProduct(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview("");
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  }

  function openEditForm(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      stock: String(product.stock),
      cargoPrice: String(product.cargoPrice),
      category: product.categoryName ?? "",
    });
    setImageFile(null);
    setImagePreview(product.imageUrl ?? "");
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview("");
    setFormError("");
    setFormSuccess("");
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setFormError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError("Image must be smaller than 5 MB.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setFormError("");
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    const price = parseFloat(form.price);
    const stock = parseInt(form.stock, 10);
    const cargoPrice = 0; // ignore individual cargo price

    if (!form.name.trim()) { setFormError("Product name is required."); return; }
    if (isNaN(price) || price < 0) { setFormError("Price must be a valid non-negative number."); return; }
    if (isNaN(stock) || stock < 0) { setFormError("Stock must be a valid non-negative integer."); return; }

    setFormSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        price,
        stock,
        cargoPrice,
        categoryId: categories.find(c => c.name === form.category)?.id ?? null,
      };

      let savedProduct: Product;
      if (editingProduct) {
        savedProduct = await productApi.update(editingProduct.id, payload);
      } else {
        savedProduct = await productApi.create(payload);
      }

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        try {
          await productApi.uploadImage(savedProduct.id, fd);
        } catch (err: unknown) {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : "The image was rejected.";
          setFormError(`The product was saved, but the image was not uploaded. ${msg}`);
          loadProducts();
          return;
        }
      }

      setFormSuccess(editingProduct ? "Product updated successfully!" : "Product created successfully!");
      loadProducts();
      setTimeout(() => closeForm(), 1200);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to save product.";
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await productApi.delete(id);
      setDeleteConfirm(null);
      loadProducts();
    } catch {
      alert("Failed to delete product.");
    }
  }

  // ── Order detail helpers ───────────────────────────────────────────────────

  function openOrderDetail(order: Order) {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setTab("order-detail");
  }

  async function quickStatus(order: Order, status: string) {
    setStatusBusyId(order.id);
    try {
      const updated = await orderApi.updateStatus(order.id, status);
      setOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedOrder((current) => (current?.id === updated.id ? updated : current));
      if (selectedOrder?.id === updated.id) setNewStatus(updated.status);
    } catch {
      alert("Failed to update status.");
    } finally {
      setStatusBusyId(null);
    }
  }

  async function handleStatusUpdate() {
    if (!selectedOrder || !newStatus) return;
    setStatusUpdating(true);
    try {
      const updated = await orderApi.updateStatus(selectedOrder.id, newStatus);
      setSelectedOrder(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch {
      alert("Failed to update status.");
    } finally {
      setStatusUpdating(false);
    }
  }

  // ── Guard rendering ────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50 text-stone-900 dark:bg-surface-900 dark:text-stone-50">
        <div className="animate-pulse text-stone-600 dark:text-stone-300">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-surface-50 p-4 text-stone-900 dark:bg-surface-900 dark:text-stone-50 md:p-6">
      <div className="mx-auto max-w-7xl">

        {/* Page header */}
        <div className="mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-50 md:text-4xl">Admin Panel</h1>
            <p className="text-sm text-stone-600 dark:text-stone-300 mt-1">Manage your store</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
            Dashboard
          </TabButton>
          <TabButton active={tab === "products"} onClick={() => { setTab("products"); closeForm(); }}>
            Products
          </TabButton>
          <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
            Orders
          </TabButton>
          <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
            Analytics
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            Settings
          </TabButton>
          {tab === "order-detail" && selectedOrder && (
            <TabButton active={true} onClick={() => {}}>
              Order #{selectedOrder.id}
            </TabButton>
          )}
        </div>

        {/* ── DASHBOARD TAB ─────────────────────────────────────────────────── */}
        {tab === "dashboard" && (
          <div className="animate-fade-in space-y-6">
            {freshOrders.length > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-primary-800 dark:bg-primary-900/30">
                <p className="text-sm font-semibold text-primary-900 dark:text-primary-100">
                  {freshOrders.length === 1
                    ? `New order from ${freshOrders[0].customerName}`
                    : `${freshOrders.length} new orders just came in`}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      openOrderDetail(freshOrders[0]);
                      setFreshOrders([]);
                    }}
                    className="rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Review
                  </button>
                  <button
                    onClick={() => setFreshOrders([])}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-primary-800 dark:text-primary-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ActionCard title="Add product" detail="Put something new in the shop" onClick={() => { setTab("products"); openAddForm(); }} />
              <ActionCard title="Review orders" detail={`${stats.pending} waiting · ${stats.totalOrders} total`} onClick={() => setTab("orders")} />
              <ActionCard title="Delivery fees" detail={`${zones.length} towns configured`} onClick={() => setTab("settings")} />
              <ActionCard title="Categories" detail={`${categories.length} categories`} onClick={() => setTab("settings")} />
            </section>

            <section className="shop-card p-5 shadow-lg">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold text-stone-900 dark:text-stone-50">Needs a decision</h2>
                  <p className="mt-1 text-sm text-stone-500">Confirm or cancel new orders. The customer is notified when the status changes.</p>
                </div>
                <button onClick={() => loadOrders()} className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                  Refresh
                </button>
              </div>
              {ordersError && <p className="mb-3 text-sm text-red-700 dark:text-red-300">{ordersError}</p>}
              {ordersLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-100 dark:bg-surface-800" />
                  ))}
                </div>
              ) : stats.pending === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">No orders are waiting. New checkouts appear here on their own.</p>
              ) : (
                <div className="space-y-3">
                  {orders.filter((order) => order.status === "PENDING").map((order) => (
                    <article key={order.id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-4 sm:flex-row sm:items-center dark:border-surface-700">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-stone-900 dark:text-stone-50">#{order.id} · {order.customerName}</p>
                        <p className="mt-0.5 truncate text-sm text-stone-500">
                          {formatDate(order.orderDate)} · {(order.items ?? []).length} items · {order.townName || order.deliveryAddress}
                        </p>
                      </div>
                      <p className="font-display text-lg font-semibold text-primary-700 dark:text-primary-300">{formatMMK(order.total)}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => quickStatus(order, "CONFIRMED")}
                          disabled={statusBusyId === order.id}
                          className="rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => quickStatus(order, "CANCELLED")}
                          disabled={statusBusyId === order.id}
                          className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50 dark:bg-red-400/10 dark:text-red-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => openOrderDetail(order)}
                          className="rounded-xl bg-surface-100 px-3 py-2 text-xs font-semibold text-stone-800 dark:bg-surface-800 dark:text-stone-100"
                        >
                          Open
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="shop-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-stone-900 dark:text-stone-50">Low stock</h2>
                  <button onClick={() => setTab("products")} className="text-sm font-semibold text-primary-700 dark:text-primary-300">Edit products</button>
                </div>
                {products.filter((product) => product.stock <= 5).length === 0 ? (
                  <p className="text-sm text-stone-500">Stock looks fine.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {products.filter((product) => product.stock <= 5).slice(0, 6).map((product) => (
                      <li key={product.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">{product.name}</span>
                        <span className={product.stock === 0 ? "font-semibold text-red-700 dark:text-red-300" : "font-semibold text-amber-700 dark:text-amber-200"}>
                          {product.stock === 0 ? "Out" : product.stock}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="shop-card p-5">
                <h2 className="mb-3 font-semibold text-stone-900 dark:text-stone-50">Store pulse</h2>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Pulse label="Products" value={stats.totalProducts} />
                  <Pulse label="Processing" value={stats.processing} />
                  <Pulse label="Delivered" value={stats.delivered} />
                  <Pulse label="Cancelled" value={stats.cancelled} />
                </dl>
              </section>
            </div>
          </div>
        )}

        {/* ── PRODUCTS TAB ─────────────────────────────────────────────────── */}
        {tab === "products" && (
          <div className="animate-fade-in space-y-6">

            {/* Add Product Form */}
            {showForm ? (
              <div className="shop-card p-6 shadow-lg animate-fade-in">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-50">
                    {editingProduct ? "Edit Product" : "Add New Product"}
                  </h2>
                  <button
                    onClick={closeForm}
                    className="rounded-full p-2 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-stone-600 dark:text-stone-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Name */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">
                        Product Name <span className="text-red-700 dark:text-red-300">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Wireless Headphones"
                        className="w-full rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                      />
                    </div>

                    {/* Description */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Describe the product..."
                        rows={3}
                        className="w-full rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow resize-none"
                      />
                    </div>

                    {/* Category */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">
                        Category
                        <span className="ml-2 text-xs text-stone-600 dark:text-stone-300">(manage in Settings)</span>
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="w-full rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                      >
                        <option value="">— No Category —</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Price */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Price (MMK) <span className="text-red-700 dark:text-red-300">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="1"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        placeholder="50000"
                        className="w-full rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                      />
                    </div>

                    {/* Stock */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Stock <span className="text-red-700 dark:text-red-300">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="1"
                        value={form.stock}
                        onChange={(e) => setForm({ ...form, stock: e.target.value })}
                        placeholder="10"
                        className="w-full rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                      />
                    </div>



                    {/* Image upload */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Product Image
                        {editingProduct && <span className="ml-1 text-xs text-stone-600 dark:text-stone-300">(leave blank to keep existing)</span>}
                      </label>
                      <div className="flex items-start gap-4">
                        {imagePreview && (
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="h-20 w-20 rounded-xl object-cover border border-stone-200 dark:border-surface-700 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageChange}
                            className="hidden"
                            id="product-image-input"
                          />
                          <label
                            htmlFor="product-image-input"
                            className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-surface-50 px-4 py-3 text-sm text-stone-700 transition-colors hover:border-primary-400 hover:text-primary-700 dark:border-surface-700 dark:bg-surface-900 dark:text-stone-200 dark:hover:text-primary-200"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {imageFile ? imageFile.name : "Choose image (max 5 MB)"}
                          </label>
                          {imageFile && (
                            <button
                              type="button"
                              onClick={() => {
                                setImageFile(null);
                                setImagePreview(editingProduct?.imageUrl ?? "");
                                if (fileInputRef.current) fileInputRef.current.value = "";
                              }}
                              className="mt-1 text-xs text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                            >
                              Remove selected image
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {formError && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
                      {formError}
                    </div>
                  )}
                  {formSuccess && (
                    <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-700 dark:text-green-300 dark:text-green-400">
                      {formSuccess}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                    <button
                      type="submit"
                      disabled={formSubmitting}
                      className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white  hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {formSubmitting
                        ? (editingProduct ? "Saving..." : "Creating...")
                        : (editingProduct ? "Save Changes" : "Add Product")}
                    </button>
                    <button
                      type="button"
                      onClick={closeForm}
                      className="rounded-xl border border-stone-200 bg-white text-stone-800 dark:border-surface-700 dark:bg-surface-800 dark:text-stone-100 px-6 py-3 text-sm font-semibold hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-50">Products ({products.length})</h2>
                <button
                  onClick={openAddForm}
                  className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white  hover:bg-primary-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Product
                </button>
              </div>
            )}

            {/* Products list */}
            {!showForm && (
              productsLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-20 rounded-2xl animate-pulse bg-surface-100 dark:bg-surface-800" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-20 text-stone-600 dark:text-stone-300">
                  <p className="text-lg font-medium">No products yet.</p>
                  <p className="text-sm mt-1">Click "Add Product" to get started.</p>
                </div>
              ) : (
                <div className="shop-card shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[44rem] text-sm">
                      <thead className="bg-surface-100 text-stone-700 dark:bg-surface-950 dark:text-stone-200">
                        <tr className="text-left text-xs text-stone-600 dark:text-stone-300 uppercase tracking-wide">
                          <th className="px-5 py-3">Product</th>
                          <th className="px-5 py-3">Category</th>
                          <th className="px-5 py-3">Price</th>
                          <th className="px-5 py-3">Stock</th>
                          
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200 dark:divide-surface-700">
                        {products.map((product) => (
                          <tr key={product.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {product.imageUrl ? (
                                  <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded-xl object-cover flex-shrink-0" />
                                ) : (
                                  <div className="h-12 w-12 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-stone-600 dark:text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold text-stone-900 dark:text-stone-50">{product.name}</p>
                                  <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-1">{product.description}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {product.category ? (
                                <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300">
                                  {product.category}
                                </span>
                              ) : (
                                <span className="text-xs text-stone-600 dark:text-stone-300">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 font-semibold text-primary-700 dark:text-primary-300">{formatMMK(product.price)}</td>
                            <td className="px-5 py-4">
                              <span className={`font-semibold ${product.stock === 0 ? "text-red-700 dark:text-red-300" : product.stock <= 5 ? "text-orange-700 dark:text-orange-300" : "text-green-700 dark:text-green-300"}`}>
                                {product.stock === 0 ? "Out of stock" : product.stock}
                              </span>
                            </td>
                            
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditForm(product)}
                                  className="rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:bg-surface-800 dark:text-stone-100 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-200 transition-colors"
                                >
                                  Edit
                                </button>
                                {deleteConfirm === product.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDelete(product.id)}
                                      className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:bg-surface-800 dark:text-stone-100 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(product.id)}
                                    className="rounded-lg bg-surface-100 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:bg-surface-800 dark:text-stone-100 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ── ORDERS TAB ───────────────────────────────────────────────────── */}
        {tab === "orders" && (
          <div className="animate-fade-in space-y-4">
            {ordersError && <p className="text-sm text-red-700 dark:text-red-300">{ordersError}</p>}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-50">All Orders ({orders.length})</h2>
              <button
                onClick={() => loadOrders()}
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white text-stone-800 dark:border-surface-700 dark:bg-surface-800 dark:text-stone-100 px-4 py-2 text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {ordersLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-20 rounded-2xl animate-pulse bg-surface-100 dark:bg-surface-800" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-20 text-stone-600 dark:text-stone-300">
                <p className="text-lg font-medium">No orders yet.</p>
              </div>
            ) : (
              <div className="shop-card shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] text-sm">
                    <thead className="bg-surface-100 text-stone-700 dark:bg-surface-950 dark:text-stone-200">
                      <tr className="text-left text-xs text-stone-600 dark:text-stone-300 uppercase tracking-wide">
                        <th className="px-5 py-3">Order</th>
                        <th className="px-5 py-3">Customer</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Items</th>
                        <th className="px-5 py-3">Total</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 dark:divide-surface-700">
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                          <td className="px-5 py-4 font-semibold">#{order.id}</td>
                          <td className="px-5 py-4">
                            <p className="font-medium text-stone-900 dark:text-stone-50">{order.customerName}</p>
                            <p className="text-xs text-stone-600 dark:text-stone-300">{order.customerEmail}</p>
                          </td>
                          <td className="px-5 py-4 text-stone-600 dark:text-stone-300 text-xs">{formatDate(order.orderDate)}</td>
                          <td className="px-5 py-4 text-stone-600 dark:text-stone-300">{(order.items ?? []).length} item{(order.items ?? []).length !== 1 ? "s" : ""}</td>
                          <td className="px-5 py-4 font-semibold text-primary-700 dark:text-primary-300">{formatMMK(order.total)}</td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOrderStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => openOrderDetail(order)}
                              className="rounded-lg bg-primary-100 dark:bg-primary-900/30 px-3 py-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ANALYTICS TAB ─────────────────────────────────────────────────── */}
        {tab === "analytics" && <AdminAnalytics />}

        {tab === "settings" && (
          <div className="animate-fade-in space-y-8">
            <h2 className="font-display text-xl font-bold text-stone-900 dark:text-stone-50">Store Settings</h2>

            {/* ── Category Manager ──────────────────────────────── */}
            <div className="shop-card p-6 shadow-lg space-y-5">
              <div>
                <h3 className="mb-1 text-lg font-semibold text-stone-900 dark:text-stone-50">Product Categories</h3>
                <p className="text-sm text-stone-600 dark:text-stone-300">Define categories used when creating products</p>
              </div>

              {/* Add new category */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
                  placeholder="e.g. Kitchen, Kids, Electronics..."
                  className="flex-1 rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <button
                  onClick={addCategory}
                  className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
              {catError && <p className="text-sm text-red-700 dark:text-red-300">{catError}</p>}

              {/* List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl border border-stone-200 bg-surface-100 px-4 py-2.5 text-stone-800 dark:border-surface-700 dark:bg-surface-900 dark:text-stone-100"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{cat.name}</span>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="ml-2 text-stone-600 transition-colors hover:text-red-700 dark:text-stone-300 dark:hover:text-red-300"
                      title="Delete category"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {categories.length === 0 && (
                <p className="text-sm text-stone-600 dark:text-stone-300 text-center py-4">No categories yet. Add one above.</p>
              )}
            </div>

            {/* ── Delivery Zone Manager ──────────────────────────── */}
            <div className="shop-card p-6 shadow-lg space-y-5">
              <div>
                <h3 className="mb-1 text-lg font-semibold text-stone-900 dark:text-stone-50">Delivery Zones & Fees</h3>
                <p className="text-sm text-stone-600 dark:text-stone-300">Predefine delivery fees by location. Users will select their town at checkout.</p>
              </div>

              {/* Add new zone */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={newZoneTown}
                  onChange={(e) => setNewZoneTown(e.target.value)}
                  placeholder="Town (e.g. Hlaing)"
                  className="flex-1 rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <input
                  type="number"
                  value={newZoneFee}
                  onChange={(e) => setNewZoneFee(e.target.value)}
                  placeholder="Fee (MMK)"
                  min="0"
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-base text-stone-900 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-surface-700 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 sm:w-36 sm:text-sm"
                />
                <button
                  onClick={addZone}
                  className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
              {zoneError && <p className="text-sm text-red-700 dark:text-red-300">{zoneError}</p>}

              {/* Zone list */}
              <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-surface-700">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-surface-100 text-stone-700 dark:bg-surface-950 dark:text-stone-200">
                    <tr className="text-left text-xs text-stone-600 dark:text-stone-300 uppercase tracking-wide">
                      <th className="px-4 py-3">Town / Location</th>
                      <th className="px-4 py-3">Delivery Fee</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-surface-700">
                    {zones.map((zone) => (
                      <tr key={zone.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                        <td className="px-4 py-3">
                          {editingZone?.id === zone.id ? (
                            <input
                              value={editingZone.townName}
                              onChange={(e) => editingZone && setEditingZone({ ...editingZone, townName: e.target.value })}
                              className="w-36 rounded-lg border border-primary-300 bg-white px-2 py-1 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:bg-surface-900 dark:text-stone-50"
                            />
                          ) : (
                            <span className="font-medium">{zone.townName}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {editingZone?.id === zone.id ? (
                            <input
                              type="number"
                              value={editingZone.fee}
                              onChange={(e) => setEditingZone({ ...editingZone, fee: parseFloat(e.target.value) || 0 })}
                              className="w-28 rounded-lg border border-primary-300 bg-white px-2 py-1 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:bg-surface-900 dark:text-stone-50"
                            />
                          ) : (
                            <span className="font-semibold text-primary-700 dark:text-primary-300">{formatMMK(zone.fee)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editingZone?.id === zone.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={saveEditZone}
                                className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingZone(null)}
                                className="rounded-lg bg-surface-100 px-3 py-1 text-xs font-semibold text-stone-800 dark:bg-surface-800 dark:text-stone-100 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => startEditZone(zone)}
                                className="rounded-lg bg-surface-100 px-3 py-1 text-xs font-semibold text-stone-800 dark:bg-surface-800 dark:text-stone-100 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-200 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteZone(zone.id)}
                                className="rounded-lg bg-surface-100 px-3 py-1 text-xs font-semibold text-stone-800 dark:bg-surface-800 dark:text-stone-100 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {zones.length === 0 && (
                  <p className="text-sm text-stone-600 dark:text-stone-300 text-center py-6">No delivery zones yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ORDER DETAIL TAB ─────────────────────────────────────────────── */}
        {tab === "order-detail" && selectedOrder && (
          <div className="animate-fade-in space-y-6">
            {/* Back button */}
            <button
              onClick={() => setTab("orders")}
              className="flex items-center gap-2 text-sm text-stone-700 transition-colors hover:text-primary-700 dark:text-stone-200 dark:hover:text-primary-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Orders
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main order info */}
              <div className="lg:col-span-2 space-y-5">

                {/* Header */}
                <div className="shop-card p-6 shadow-lg">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-display text-2xl font-bold text-stone-900 dark:text-stone-50">Order #{selectedOrder.id}</h2>
                      <p className="text-sm text-stone-600 dark:text-stone-300 mt-1">{formatDate(selectedOrder.orderDate)}</p>
                    </div>
                    <span className={`w-fit shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${getOrderStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>

                  {/* Customer info */}
                  <div className="space-y-2 rounded-xl bg-surface-100 p-4 text-sm text-stone-800 dark:bg-surface-950 dark:text-stone-100">
                    <h3 className="font-semibold text-stone-800 dark:text-stone-100 mb-2">Customer Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-stone-600 dark:text-stone-300">Name: </span>
                        <span className="font-medium">{selectedOrder.customerName}</span>
                      </div>
                      <div>
                        <span className="text-stone-600 dark:text-stone-300">Email: </span>
                        <span className="font-medium">{selectedOrder.customerEmail}</span>
                      </div>
                      {selectedOrder.customerPhone && (
                        <div>
                          <span className="text-stone-600 dark:text-stone-300">Phone: </span>
                          <span className="font-medium">{selectedOrder.customerPhone}</span>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <span className="text-stone-600 dark:text-stone-300">Delivery Address: </span>
                        <span className="font-medium">{selectedOrder.deliveryAddress}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order items */}
                <div className="shop-card p-6 shadow-lg">
                  <h3 className="font-semibold text-stone-800 dark:text-stone-100 mb-4">Ordered Items</h3>
                  <div className="divide-y divide-stone-200 dark:divide-surface-700">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 py-4 sm:gap-4">
                        {item.productImageUrl ? (
                          <img src={item.productImageUrl} alt={item.productName} className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-14 w-14 rounded-xl bg-surface-100 dark:bg-surface-800 flex-shrink-0 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-stone-600 dark:text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">{item.productName}</p>
                          <p className="text-xs text-stone-600 dark:text-stone-300 mt-0.5">{formatMMK(item.unitPrice)} × {item.quantity}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold">{formatMMK(item.lineTotal)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-4 border-t-2 border-dashed border-stone-200 dark:border-surface-700 pt-4 space-y-2 text-sm">
                    <div className="flex justify-between text-stone-600 dark:text-stone-300">
                      <span>Products Subtotal</span>
                      <span>{formatMMK(selectedOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-stone-600 dark:text-stone-300">
                      <span>Delivery / Cargo</span>
                      <span>{formatMMK(selectedOrder.cargoTotal)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-stone-200 dark:border-surface-700">
                      <span>TOTAL</span>
                      <span className="text-primary-700 dark:text-primary-300">{formatMMK(selectedOrder.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status update panel */}
              <div className="space-y-5">
                <div className="shop-card p-6 shadow-lg">
                  <h3 className="font-semibold text-stone-800 dark:text-stone-100 mb-4">Update Order Status</h3>

                  {/* Status flow visualization */}
                  <div className="mb-5 space-y-2">
                    {ORDER_STATUSES.filter(s => s !== "CANCELLED").map((s, idx, arr) => {
                      const currentIdx = arr.indexOf(selectedOrder.status as typeof arr[number]);
                      const isDone = idx <= currentIdx;
                      return (
                        <div key={s} className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full flex-shrink-0 ${isDone ? "bg-primary-600" : "bg-surface-200 dark:bg-surface-700"}`} />
                          <span className={`text-xs font-medium ${isDone ? "text-primary-700 dark:text-primary-200" : "text-stone-600 dark:text-stone-300"}`}>
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full flex-shrink-0 ${selectedOrder.status === "CANCELLED" ? "bg-red-500" : "bg-surface-200 dark:bg-surface-700"}`} />
                      <span className={`text-xs font-medium ${selectedOrder.status === "CANCELLED" ? "text-red-700 dark:text-red-300" : "text-stone-600 dark:text-stone-300"}`}>
                        Cancelled
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-medium">Change Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 dark:border-surface-700 bg-white text-stone-900 placeholder:text-stone-500 dark:bg-surface-900 dark:text-stone-50 dark:placeholder:text-stone-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleStatusUpdate}
                      disabled={statusUpdating || newStatus === selectedOrder.status}
                      className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white  hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {statusUpdating ? "Updating..." : "Update Status"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


