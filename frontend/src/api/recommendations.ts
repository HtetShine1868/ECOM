import api from "./client";
import type { RecommendationItem } from "../types";

const SESSION_KEY = "shopnow-session";

/** An anonymous browsing session id, so "recently viewed" works before sign-in. Not an identity. */
export function sessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export const recommendationsApi = {
  getForYou: (limit = 8) => api.get<RecommendationItem[]>(`/recommendations/for-you?limit=${limit}`),

  getRelated: (productId: number, limit = 8) =>
    api.get<RecommendationItem[]>(`/recommendations/related/${productId}?limit=${limit}`),

  getPopular: (limit = 8) => api.get<RecommendationItem[]>(`/recommendations/popular?limit=${limit}`),

  getFrequentlyBought: (productId: number, limit = 4) =>
    api.get<RecommendationItem[]>(`/recommendations/frequently-bought/${productId}?limit=${limit}`),

  /** Based on what is in the bag, then the shopper's interests. */
  getForCart: (limit = 6) => api.get<RecommendationItem[]>(`/recommendations/for-cart?limit=${limit}`),

  getRecentlyViewed: (limit = 8) => {
    const sid = sessionId();
    return api.get<RecommendationItem[]>(`/recommendations/recently-viewed?limit=${limit}${sid ? `&sessionId=${encodeURIComponent(sid)}` : ""}`);
  },

  /** Only VIEW and SEARCH_CLICK are reported from the browser; the server records carts and purchases itself. */
  trackEvent: (productId: number, eventType: "VIEW" | "SEARCH_CLICK") => {
    const sid = sessionId();
    return api
      .post<void>("/recommendations/events", { productId, eventType, sessionId: sid || undefined })
      .catch(() => undefined); // tracking must never get in the shopper's way
  },
};
