export interface User {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "BUYER" | "ADMIN";
  avatarUrl?: string;
  createdAt: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  cargoPrice: number;
  imageUrl?: string;
  categoryId?: number | null;
  categoryName?: string | null;
  category?: string | null;
  active?: boolean;
  version?: number;
  createdAt: string;
  updatedAt: string;
  unitsSold?: number;
  salesCount?: number;
}

export interface CartItem {
  id: number;
  product: Product;
  quantity: number;
  /** Set by the server on every cart read. */
  availability?: "IN_STOCK" | "INSUFFICIENT_STOCK" | "OUT_OF_STOCK" | "INACTIVE" | "REMOVED";
  priceChanged?: boolean;
  previousPrice?: number | null;
  cargoPrice?: number;
}

export interface Cart {
  id: number;
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
}

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERING"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderItem {
  id: number;
  productId: number | null;
  productName: string;
  productImageUrl?: string;
  unitPrice: number;
  cargoPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryAddress: string;
  townName?: string;
  deliveryFee?: number;
  items: OrderItem[];
  subtotal: number;
  cargoTotal: number;
  total: number;
  status: OrderStatus;
  orderDate: string;
}

export interface OrderRequest {
  customerName: string;
  customerPhone: string;
  /** ID of a predefined DeliveryZone */
  deliveryZoneId?: number;
  /** Free-text address when no zone applies — fee will be 0 */
  customDeliveryAddress?: string;
  /** Items being bought. Prices here are only the ones the customer reviewed; the server recalculates. */
  items: { productId: number; quantity: number; expectedUnitPrice?: number; expectedCargoPrice?: number }[];
  /** One key per checkout attempt; reused when retrying the same attempt. */
  idempotencyKey: string;
}

export interface ApiError {
  code?: string;
  message: string;
  status: number;
  details?: Record<string, any>;
  requestId?: string;
}

export interface AuditLog {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  changedByUserId?: number;
  changedByEmail?: string;
  oldValues?: string;
  newValues?: string;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}
