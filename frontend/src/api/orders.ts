import api from "./client";
import type { Order, OrderRequest } from "../types";

export interface DeliveryZoneApi {
  id: number;
  townName: string;
  fee: number;
  isActive: boolean;
  createdAt: string;
}

export const orderApi = {
  getAll: () => api.get<Order[]>("/orders"),

  getById: (id: number) => api.get<Order>("/orders/" + id),

  create: (data: OrderRequest) => api.post<Order>("/orders", data),

  // Delivery zones — fetched from backend API
  getActiveDeliveryZones: () => api.get<DeliveryZoneApi[]>("/delivery-zones"),

  // Admin Delivery Zones
  getAllDeliveryZonesAdmin: () =>
    api.get<DeliveryZoneApi[]>("/admin/delivery-zones"),

  createDeliveryZone: (data: { townName: string; fee: number; isActive?: boolean }) =>
    api.post<DeliveryZoneApi>("/admin/delivery-zones", data),

  updateDeliveryZone: (id: number, data: { townName: string; fee: number; isActive?: boolean }) =>
    api.put<DeliveryZoneApi>("/admin/delivery-zones/" + id, data),

  deleteDeliveryZone: (id: number) =>
    api.delete<void>("/admin/delivery-zones/" + id),

  // Admin endpoints
  getAllAdmin: () => api.get<Order[]>("/admin/orders"),

  getAdminById: (id: number) => api.get<Order>("/admin/orders/" + id),

  updateStatus: (id: number, status: string) =>
    api.put<Order>("/admin/orders/" + id + "/status", { status }),

  getAnalytics: (params: { range: string; from?: string; to?: string }) => {
    const query = new URLSearchParams({ range: params.range });
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    return api.get<StoreAnalytics>("/admin/analytics?" + query.toString());
  },
};

export interface StoreAnalytics {
  range: string;
  rangeLabel: string;
  from: string;
  to: string;
  totalRevenue: number;
  totalOrders: number;
  unitsSold: number;
  averageOrderValue: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  cancellationRate: number;
  deliveredOrders: number;
  pendingOrders: number;
  totalCustomers: number;
  customersWhoOrdered: number;
  newCustomers: number;
  returningCustomers: number;
  lowStockThreshold: number;
  salesOverTime: { label: string; revenue: number; orders: number }[];
  topProducts: ProductStat[];
  lowPerformingProducts: ProductStat[];
  frequentlyCancelledProducts: ProductStat[];
  lowStock: { id: number; name: string; stock: number }[];
  outOfStock: { id: number; name: string; stock: number }[];
  revenueByCategory: { category: string; revenue: number }[];
  statusDistribution: { status: string; count: number }[];
  topCustomers: { name: string; orders: number; spending: number }[];
}

export interface ProductStat {
  name: string;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  lastSaleDate?: string | null;
}
