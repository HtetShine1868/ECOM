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
  createdAt: string;
  updatedAt: string;
  unitsSold?: number;
  salesCount?: number;
}

export interface CartItem {
  id: number;
  product: Product;
  quantity: number;
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
  customerPhone?: string;
  /** ID of a predefined DeliveryZone */
  deliveryZoneId?: number;
  /** Free-text address when no zone applies — fee will be 0 */
  customDeliveryAddress?: string;
  /** Cart items — sent directly since the frontend uses a localStorage-only cart */
  items: { productId: number; quantity: number }[];
  idempotencyKey?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

export interface ApiError {
  message: string;
  status: number;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}
