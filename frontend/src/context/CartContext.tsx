import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CartItem, Product } from "../types";
import { cartApi } from "../api/cart";
import type { ServerCart, ServerCartItem } from "../api/cart";
import { useAuth } from "./AuthContext";

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  /** Merchandise subtotal of purchasable lines (preview only; the server recalculates at checkout). */
  totalPrice: number;
  cargoTotal: number;
  hasPriceChanges: boolean;
  hasUnavailableItems: boolean;
  /** True while the first cart load after sign-in is running. */
  loading: boolean;
  /** Set when the cart service could not be reached. */
  error: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  notice: string | null;
  addItem: (product: Product, quantity: number) => Promise<boolean>;
  removeItem: (productId: number) => Promise<void>;
  updateQuantity: (productId: number, quantity: number) => Promise<void>;
  /** The customer reviewed the current prices. */
  acknowledgePrices: () => Promise<void>;
  /** Empty the server cart (after a successful order, or on request). */
  clearCart: () => Promise<void>;
  /** Re-read the cart from the server. */
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

const LEGACY_KEY = "cart";

function toItem(line: ServerCartItem): CartItem {
  const now = new Date().toISOString();
  return {
    id: line.productId,
    quantity: line.quantity,
    availability: line.availability,
    priceChanged: line.priceChanged,
    previousPrice: line.previousPrice ?? null,
    cargoPrice: line.cargoPrice,
    product: {
      id: line.productId,
      name: line.productName,
      description: "",
      price: line.unitPrice,
      cargoPrice: line.cargoPrice,
      stock: line.availableStock,
      imageUrl: line.productImageUrl ?? undefined,
      active: line.active,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function messageOf(err: unknown, fallback: string) {
  return err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : fallback;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [cart, setCart] = useState<ServerCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const apply = useCallback((next: ServerCart | undefined) => {
    if (next) {
      setCart(next);
      setError(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await cartApi.get());
    } catch (err) {
      setError(messageOf(err, "Your bag could not be loaded."));
    }
  }, [apply]);

  // Load the cart when someone signs in; forget it when they sign out.
  const userId = user?.id;
  useEffect(() => {
    if (!isAuthenticated) {
      setCart(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // One-time move of a pre-server cart (old localStorage) into the account cart.
      try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (raw) {
          const legacy = JSON.parse(raw) as { product?: { id: number }; quantity?: number }[];
          for (const line of legacy) {
            if (line.product?.id && line.quantity && line.quantity > 0) {
              await cartApi.add(line.product.id, line.quantity).catch(() => undefined);
            }
          }
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch {
        localStorage.removeItem(LEGACY_KEY);
      }
      try {
        const next = await cartApi.get();
        if (!cancelled) apply(next);
      } catch (err) {
        if (!cancelled) setError(messageOf(err, "Your bag could not be loaded."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId, apply]);

  // Re-check prices and stock when the customer comes back to the tab.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isAuthenticated, refresh]);

  const items = useMemo(() => (cart ? cart.items.map(toItem) : []), [cart]);

  const addItem = useCallback(
    async (product: Product, quantity: number) => {
      try {
        apply(await cartApi.add(product.id, quantity));
        flash(`${product.name} added to your bag`);
        return true;
      } catch (err) {
        flash(messageOf(err, "Could not add that to your bag."));
        return false;
      }
    },
    [apply, flash]
  );

  const removeItem = useCallback(
    async (productId: number) => {
      try {
        apply(await cartApi.remove(productId));
      } catch (err) {
        flash(messageOf(err, "Could not remove that item."));
      }
    },
    [apply, flash]
  );

  const updateQuantity = useCallback(
    async (productId: number, quantity: number) => {
      try {
        apply(quantity <= 0 ? await cartApi.remove(productId) : await cartApi.update(productId, quantity));
      } catch (err) {
        flash(messageOf(err, "Could not change the quantity."));
      }
    },
    [apply, flash]
  );

  const acknowledgePrices = useCallback(async () => {
    try {
      apply(await cartApi.acknowledgePrices());
    } catch (err) {
      flash(messageOf(err, "Could not confirm the new prices. Please try again."));
    }
  }, [apply, flash]);

  const clearCart = useCallback(async () => {
    try {
      await cartApi.clear();
    } catch {
      // The order is already placed; a stale bag is corrected on the next refresh.
    }
    await refresh();
  }, [refresh]);

  const value: CartContextType = {
    items,
    totalItems: cart?.totalItems ?? 0,
    totalPrice: cart?.subtotal ?? 0,
    cargoTotal: cart?.cargoTotal ?? 0,
    hasPriceChanges: cart?.hasPriceChanges ?? false,
    hasUnavailableItems: cart?.hasUnavailableItems ?? false,
    loading,
    error,
    isOpen,
    setIsOpen,
    notice,
    addItem,
    removeItem,
    updateQuantity,
    acknowledgePrices,
    clearCart,
    refresh,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
