import api from "./client";

export type Availability = "IN_STOCK" | "INSUFFICIENT_STOCK" | "OUT_OF_STOCK" | "INACTIVE" | "REMOVED";

export interface ServerCartItem {
  productId: number;
  productName: string;
  productImageUrl?: string | null;
  unitPrice: number;
  cargoPrice: number;
  quantity: number;
  lineTotal: number;
  availableStock: number;
  available: boolean;
  active: boolean;
  availability: Availability;
  priceChanged: boolean;
  previousPrice?: number | null;
}

export interface ServerCart {
  items: ServerCartItem[];
  totalItems: number;
  subtotal: number;
  cargoTotal: number;
  total: number;
  storage: "REDIS" | "POSTGRES";
  hasPriceChanges: boolean;
  hasUnavailableItems: boolean;
}

/** Cart lives on the server. It never changes or reserves stock. */
export const cartApi = {
  get: () => api.get<ServerCart>("/cart", 0),
  add: (productId: number, quantity: number) => api.post<ServerCart>("/cart/items", { productId, quantity }),
  update: (productId: number, quantity: number) => api.put<ServerCart>("/cart/items/" + productId, { quantity }),
  remove: (productId: number) => api.delete<ServerCart>("/cart/items/" + productId),
  clear: () => api.delete<void>("/cart"),
  acknowledgePrices: () => api.post<ServerCart>("/cart/acknowledge-prices"),
};
