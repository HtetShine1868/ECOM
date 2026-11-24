import client from "./client";
import type { RecommendationItem } from "../types";

export const recommendationsApi = {
  getForYou: async (limit = 10): Promise<RecommendationItem[]> => {
    const res = await client.get<RecommendationItem[]>("/recommendations/for-you", {
      params: { limit },
    });
    return res.data;
  },

  getRelated: async (productId: number, limit = 8): Promise<RecommendationItem[]> => {
    const res = await client.get<RecommendationItem[]>(`/recommendations/related/${productId}`, {
      params: { limit },
    });
    return res.data;
  },

  getPopular: async (limit = 10): Promise<RecommendationItem[]> => {
    const res = await client.get<RecommendationItem[]>("/recommendations/popular", {
      params: { limit },
    });
    return res.data;
  },

  getFrequentlyBought: async (productId: number, limit = 6): Promise<RecommendationItem[]> => {
    const res = await client.get<RecommendationItem[]>(`/recommendations/frequently-bought/${productId}`, {
      params: { limit },
    });
    return res.data;
  },

  getRecentlyViewed: async (sessionId?: string, limit = 8): Promise<RecommendationItem[]> => {
    const res = await client.get<RecommendationItem[]>("/recommendations/recently-viewed", {
      params: { sessionId, limit },
    });
    return res.data;
  },

  trackEvent: async (
    productId: number,
    eventType: "VIEW" | "SEARCH_CLICK" | "ADD_TO_CART",
    sessionId?: string
  ): Promise<void> => {
    try {
      await client.post("/recommendations/events", {
        productId,
        eventType,
        sessionId,
      });
    } catch (e) {
      // Non-blocking tracking
      console.debug("Failed to track event", e);
    }
  },
};
