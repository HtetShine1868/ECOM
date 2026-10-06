import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

// โ”€โ”€โ”€ Analytics helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl p-5 shadow-lg flex items-center gap-4 ${color}`}>
      <div className="rounded-xl bg-white/20 p-3">{icon}</div>
      <div>
        <p className="text-xs font-medium opacity-80 uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-bold">{value}</p>
      </div>
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
      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        active
          ? "bg-primary-600 text-white"
          : "bg-surface-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-surface-200 dark:hover:bg-surface-700"
      }`}
    >
      {children}
    </button>
  );
}

// โ”€โ”€โ”€ Main Component โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export default function AdminDashboardPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("dashboard");

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

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

  // โ”€โ”€ Category Manager state โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [catError, setCatError] = useState("");

  // โ”€โ”€ Delivery Zone state โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const [zones, setZones] = useState<DeliveryZoneApi[]>([]);
  const [newZoneTown, setNewZoneTown] = useState("");
  const [newZoneFee, setNewZoneFee] = useState("");
  const [editingZone, setEditingZone] = useState<DeliveryZoneApi | null>(null);
  const [zoneError, setZoneError] = useState("");

  // โ”€โ”€ Analytics state โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  // โ”€โ”€ Auth guard โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, authLoading, navigate]);

  // โ”€โ”€ Load localStorage data โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€



  // โ”€โ”€ Data loading โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  const loadProducts = useCallback(() => {
    setProductsLoading(true);
    productApi
      .getAll()
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, []);

  const loadOrders = useCallback(() => {
    setOrdersLoading(true);
    orderApi
      .getAllAdmin()
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
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

  // โ”€โ”€ Computed stats โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  const stats = {
    totalProducts: products.length,
    totalOrders: orders.length,
    pending: orders.filter((o) => o.status === "PENDING").length,
    processing: orders.filter((o) => o.status === "PROCESSING").length,
    delivered: orders.filter((o) => o.status === "DELIVERED").length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
  };

  // โ”€โ”€ Analytics computation โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€


  // โ”€โ”€ Category Manager helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

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

  // โ”€โ”€ Delivery Zone helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

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

  // โ”€โ”€ Product form helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

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
    if (!file.type.startsWith("image/")) {
      setFormError("Please select a valid image file.");
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
        await productApi.uploadImage(savedProduct.id, fd);
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

  // โ”€โ”€ Order detail helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  function openOrderDetail(order: Order) {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setTab("order-detail");
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

  // โ”€โ”€ Guard rendering โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  if (authLoading) {
    return (
      <div className="bg-surface-50 dark:bg-surface-900 min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) return null;

  // โ”€โ”€ Render โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  return (
    <div className="bg-surface-50 dark:bg-surface-900 min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-7xl">

        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold">Admin Panel</h1>
            <p className="text-sm text-gray-400 mt-1">Manage your store</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap mb-8">
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
            ๐“ Dashboard
          </TabButton>
          <TabButton active={tab === "products"} onClick={() => { setTab("products"); closeForm(); }}>
            ๐“ฆ Products
          </TabButton>
          <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
            ๐’ Orders
          </TabButton>
          <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
            ๐“ Analytics
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            โ๏ธ Settings
          </TabButton>
          {tab === "order-detail" && selectedOrder && (
            <TabButton active={true} onClick={() => {}}>
              ๐“ Order #{selectedOrder.id}
            </TabButton>
          )}
        </div>

        {/* โ”€โ”€ DASHBOARD TAB โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
        {tab === "dashboard" && (
          <div className="animate-fade-in space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="Total Products"
                value={stats.totalProducts}
                color="bg-gradient-to-br from-primary-500 to-primary-600 text-white"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                }
              />
              <StatCard
                label="Total Orders"
                value={stats.totalOrders}
                color="bg-gradient-to-br from-accent-500 to-accent-600 text-white"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
              />
              <StatCard
                label="Pending Orders"
                value={stats.pending}
                color="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <StatCard
                label="Processing"
                value={stats.processing}
                color="bg-gradient-to-br from-purple-500 to-purple-600 text-white"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
              />
              <StatCard
                label="Delivered"
                value={stats.delivered}
                color="bg-gradient-to-br from-green-500 to-green-600 text-white"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                }
              />
              <StatCard
                label="Cancelled"
                value={stats.cancelled}
                color="bg-gradient-to-br from-red-500 to-red-600 text-white"
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                }
              />
            </div>

            {/* Recent orders snapshot */}
            <div className="rounded-2xl bg-white dark:bg-surface-800/50 p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">Recent Orders</h2>
                <button
                  onClick={() => setTab("orders")}
                  className="text-sm text-primary-500 hover:underline"
                >
                  View all โ’
                </button>
              </div>
              {ordersLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 rounded-xl animate-pulse bg-surface-100 dark:bg-surface-800" />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No orders yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-surface-100 dark:border-surface-800">
                        <th className="pb-2 pr-4">Order</th>
                        <th className="pb-2 pr-4">Customer</th>
                        <th className="pb-2 pr-4">Total</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                      {orders.slice(0, 8).map((order) => (
                        <tr
                          key={order.id}
                          className="cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors"
                          onClick={() => openOrderDetail(order)}
                        >
                          <td className="py-2.5 pr-4 font-medium">#{order.id}</td>
                          <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300">{order.customerName}</td>
                          <td className="py-2.5 pr-4 font-semibold">{formatMMK(order.total)}</td>
                          <td className="py-2.5">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getOrderStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* โ”€โ”€ PRODUCTS TAB โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
        {tab === "products" && (
          <div className="animate-fade-in space-y-6">

            {/* Add Product Form */}
            {showForm ? (
              <div className="rounded-2xl bg-white dark:bg-surface-800/50 p-6 shadow-lg animate-fade-in">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-xl font-bold">
                    {editingProduct ? "Edit Product" : "Add New Product"}
                  </h2>
                  <button
                    onClick={closeForm}
                    className="rounded-full p-2 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors text-gray-400"
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
                        Product Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Wireless Headphones"
                        className="w-full rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
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
                        className="w-full rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow resize-none"
                      />
                    </div>

                    {/* Category */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">
                        Category
                        <span className="ml-2 text-xs text-gray-400">(manage in โ๏ธ Settings)</span>
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="w-full rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                      >
                        <option value="">โ€” No Category โ€”</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Price */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Price (MMK) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="1"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        placeholder="50000"
                        className="w-full rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                      />
                    </div>

                    {/* Stock */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Stock <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="1"
                        value={form.stock}
                        onChange={(e) => setForm({ ...form, stock: e.target.value })}
                        placeholder="10"
                        className="w-full rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                      />
                    </div>



                    {/* Image upload */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Product Image
                        {editingProduct && <span className="ml-1 text-xs text-gray-400">(leave blank to keep existing)</span>}
                      </label>
                      <div className="flex items-start gap-4">
                        {imagePreview && (
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="h-20 w-20 rounded-xl object-cover border border-surface-200 dark:border-surface-700 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                            id="product-image-input"
                          />
                          <label
                            htmlFor="product-image-input"
                            className="cursor-pointer flex items-center gap-2 rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 px-4 py-3 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-500 transition-colors"
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
                              className="mt-1 text-xs text-red-400 hover:text-red-600"
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
                    <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-600 dark:text-green-400">
                      {formSuccess}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={formSubmitting}
                      className="flex-1 rounded-xl bg-primary-500 py-3 text-sm font-semibold text-white  hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {formSubmitting
                        ? (editingProduct ? "Saving..." : "Creating...")
                        : (editingProduct ? "Save Changes" : "Add Product")}
                    </button>
                    <button
                      type="button"
                      onClick={closeForm}
                      className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-6 py-3 text-sm font-semibold hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Products ({products.length})</h2>
                <button
                  onClick={openAddForm}
                  className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white  hover:bg-primary-600 transition-colors"
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
                <div className="text-center py-20 text-gray-400">
                  <p className="text-lg font-medium">No products yet.</p>
                  <p className="text-sm mt-1">Click "Add Product" to get started.</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white dark:bg-surface-800/50 shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-50 dark:bg-surface-900">
                        <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                          <th className="px-5 py-3">Product</th>
                          <th className="px-5 py-3">Category</th>
                          <th className="px-5 py-3">Price</th>
                          <th className="px-5 py-3">Stock</th>
                          
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                        {products.map((product) => (
                          <tr key={product.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                {product.imageUrl ? (
                                  <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded-xl object-cover flex-shrink-0" />
                                ) : (
                                  <div className="h-12 w-12 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                )}
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-gray-100">{product.name}</p>
                                  <p className="text-xs text-gray-400 line-clamp-1">{product.description}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {product.category ? (
                                <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:text-primary-300">
                                  {product.category}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">โ€”</span>
                              )}
                            </td>
                            <td className="px-5 py-4 font-semibold text-primary-600">{formatMMK(product.price)}</td>
                            <td className="px-5 py-4">
                              <span className={`font-semibold ${product.stock === 0 ? "text-red-500" : product.stock <= 5 ? "text-orange-500" : "text-green-600"}`}>
                                {product.stock === 0 ? "Out of stock" : product.stock}
                              </span>
                            </td>
                            
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditForm(product)}
                                  className="rounded-lg bg-surface-100 dark:bg-surface-800 px-3 py-1.5 text-xs font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600 transition-colors"
                                >
                                  Edit
                                </button>
                                {deleteConfirm === product.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDelete(product.id)}
                                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="rounded-lg bg-surface-100 dark:bg-surface-800 px-3 py-1.5 text-xs font-semibold hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(product.id)}
                                    className="rounded-lg bg-surface-100 dark:bg-surface-800 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
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

        {/* โ”€โ”€ ORDERS TAB โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
        {tab === "orders" && (
          <div className="animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">All Orders ({orders.length})</h2>
              <button
                onClick={loadOrders}
                className="flex items-center gap-2 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-4 py-2 text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
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
              <div className="text-center py-20 text-gray-400">
                <p className="text-lg font-medium">No orders yet.</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-white dark:bg-surface-800/50 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 dark:bg-surface-900">
                      <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                        <th className="px-5 py-3">Order</th>
                        <th className="px-5 py-3">Customer</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Items</th>
                        <th className="px-5 py-3">Total</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                      {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                          <td className="px-5 py-4 font-semibold">#{order.id}</td>
                          <td className="px-5 py-4">
                            <p className="font-medium text-gray-900 dark:text-gray-100">{order.customerName}</p>
                            <p className="text-xs text-gray-400">{order.customerEmail}</p>
                          </td>
                          <td className="px-5 py-4 text-gray-500 text-xs">{formatDate(order.orderDate)}</td>
                          <td className="px-5 py-4 text-gray-500">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</td>
                          <td className="px-5 py-4 font-semibold text-primary-600">{formatMMK(order.total)}</td>
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

        {/* โ”€โ”€ ANALYTICS TAB โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
        {tab === "analytics" && <AdminAnalytics />}

        {tab === "settings" && (
          <div className="animate-fade-in space-y-8">
            <h2 className="font-display text-xl font-bold">โ๏ธ Store Settings</h2>

            {/* โ”€โ”€ Category Manager โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
            <div className="rounded-2xl bg-white dark:bg-surface-800/50 p-6 shadow-lg space-y-5">
              <div>
                <h3 className="font-semibold text-lg mb-1">๐ท๏ธ Product Categories</h3>
                <p className="text-sm text-gray-400">Define categories used when creating products</p>
              </div>

              {/* Add new category */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
                  placeholder="e.g. Kitchen, Kids, Electronics..."
                  className="flex-1 rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <button
                  onClick={addCategory}
                  className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
              {catError && <p className="text-sm text-red-500">{catError}</p>}

              {/* List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 px-4 py-2.5"
                  >
                    <span className="text-sm font-medium">{cat.name}</span>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
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
                <p className="text-sm text-gray-400 text-center py-4">No categories yet. Add one above.</p>
              )}
            </div>

            {/* โ”€โ”€ Delivery Zone Manager โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
            <div className="rounded-2xl bg-white dark:bg-surface-800/50 p-6 shadow-lg space-y-5">
              <div>
                <h3 className="font-semibold text-lg mb-1">๐ Delivery Zones & Fees</h3>
                <p className="text-sm text-gray-400">Predefine delivery fees by location. Users will select their town at checkout.</p>
              </div>

              {/* Add new zone */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newZoneTown}
                  onChange={(e) => setNewZoneTown(e.target.value)}
                  placeholder="Town (e.g. Hlaing)"
                  className="flex-1 rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <input
                  type="number"
                  value={newZoneFee}
                  onChange={(e) => setNewZoneFee(e.target.value)}
                  placeholder="Fee (MMK)"
                  min="0"
                  className="w-36 rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
                <button
                  onClick={addZone}
                  className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
              {zoneError && <p className="text-sm text-red-500">{zoneError}</p>}

              {/* Zone list */}
              <div className="rounded-xl border border-surface-100 dark:border-surface-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 dark:bg-surface-900">
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-3">Town / Location</th>
                      <th className="px-4 py-3">Delivery Fee</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
                    {zones.map((zone) => (
                      <tr key={zone.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                        <td className="px-4 py-3">
                          {editingZone?.id === zone.id ? (
                            <input
                              value={editingZone.townName}
                              onChange={(e) => editingZone && setEditingZone({ ...editingZone, townName: e.target.value })}
                              className="rounded-lg border border-primary-300 bg-white dark:bg-surface-900 px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
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
                              className="rounded-lg border border-primary-300 bg-white dark:bg-surface-900 px-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                            />
                          ) : (
                            <span className="font-semibold text-primary-600">{formatMMK(zone.fee)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editingZone?.id === zone.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={saveEditZone}
                                className="rounded-lg bg-green-500 px-3 py-1 text-xs font-semibold text-white hover:bg-green-600 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingZone(null)}
                                className="rounded-lg bg-surface-100 dark:bg-surface-800 px-3 py-1 text-xs font-semibold hover:bg-surface-200 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => startEditZone(zone)}
                                className="rounded-lg bg-surface-100 dark:bg-surface-800 px-3 py-1 text-xs font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteZone(zone.id)}
                                className="rounded-lg bg-surface-100 dark:bg-surface-800 px-3 py-1 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
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
                  <p className="text-sm text-gray-400 text-center py-6">No delivery zones yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* โ”€โ”€ ORDER DETAIL TAB โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
        {tab === "order-detail" && selectedOrder && (
          <div className="animate-fade-in space-y-6">
            {/* Back button */}
            <button
              onClick={() => setTab("orders")}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary-500 transition-colors"
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
                <div className="rounded-2xl bg-white dark:bg-surface-800/50 p-6 shadow-lg">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-display text-2xl font-bold">Order #{selectedOrder.id}</h2>
                      <p className="text-sm text-gray-400 mt-1">{formatDate(selectedOrder.orderDate)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${getOrderStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>

                  {/* Customer info */}
                  <div className="bg-surface-50 dark:bg-surface-900 rounded-xl p-4 space-y-2 text-sm">
                    <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Customer Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-400">Name: </span>
                        <span className="font-medium">{selectedOrder.customerName}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Email: </span>
                        <span className="font-medium">{selectedOrder.customerEmail}</span>
                      </div>
                      {selectedOrder.customerPhone && (
                        <div>
                          <span className="text-gray-400">Phone: </span>
                          <span className="font-medium">{selectedOrder.customerPhone}</span>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <span className="text-gray-400">Delivery Address: </span>
                        <span className="font-medium">{selectedOrder.deliveryAddress}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order items */}
                <div className="rounded-2xl bg-white dark:bg-surface-800/50 p-6 shadow-lg">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4">Ordered Items</h3>
                  <div className="divide-y divide-surface-100 dark:divide-surface-800">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="py-4 flex items-center gap-4">
                        {item.productImageUrl ? (
                          <img src={item.productImageUrl} alt={item.productName} className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-14 w-14 rounded-xl bg-surface-100 dark:bg-surface-800 flex-shrink-0 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.productName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatMMK(item.unitPrice)} ร— {item.quantity}</p>
                        </div>
                        <p className="font-bold text-sm">{formatMMK(item.lineTotal)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-4 border-t-2 border-dashed border-surface-200 dark:border-surface-700 pt-4 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-500">
                      <span>Products Subtotal</span>
                      <span>{formatMMK(selectedOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Delivery / Cargo</span>
                      <span>{formatMMK(selectedOrder.cargoTotal)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-surface-200 dark:border-surface-700">
                      <span>TOTAL</span>
                      <span className="text-primary-600">{formatMMK(selectedOrder.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status update panel */}
              <div className="space-y-5">
                <div className="rounded-2xl bg-white dark:bg-surface-800/50 p-6 shadow-lg">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4">Update Order Status</h3>

                  {/* Status flow visualization */}
                  <div className="mb-5 space-y-2">
                    {ORDER_STATUSES.filter(s => s !== "CANCELLED").map((s, idx, arr) => {
                      const currentIdx = arr.indexOf(selectedOrder.status as typeof arr[number]);
                      const isDone = idx <= currentIdx;
                      return (
                        <div key={s} className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full flex-shrink-0 ${isDone ? "bg-primary-500" : "bg-surface-200 dark:bg-surface-700"}`} />
                          <span className={`text-xs font-medium ${isDone ? "text-primary-600 dark:text-primary-400" : "text-gray-400"}`}>
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full flex-shrink-0 ${selectedOrder.status === "CANCELLED" ? "bg-red-500" : "bg-surface-200 dark:bg-surface-700"}`} />
                      <span className={`text-xs font-medium ${selectedOrder.status === "CANCELLED" ? "text-red-500" : "text-gray-400"}`}>
                        Cancelled
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-medium">Change Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full rounded-xl border border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleStatusUpdate}
                      disabled={statusUpdating || newStatus === selectedOrder.status}
                      className="w-full rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white  hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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


