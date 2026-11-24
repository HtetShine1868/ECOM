import client from "./client";
import type { PageResponse, RatingSummary, Review } from "../types";

export interface ReviewPayload {
  rating: number;
  title?: string;
  comment?: string;
  imageUrls?: string[];
}

export const reviewsApi = {
  getProductReviews: async (
    productId: number,
    page = 0,
    size = 10,
    sortBy = "newest"
  ): Promise<PageResponse<Review>> => {
    const res = await client.get<PageResponse<Review>>(
      `/products/${productId}/reviews`,
      { params: { page, size, sortBy } }
    );
    return res.data;
  },

  getRatingSummary: async (productId: number): Promise<RatingSummary> => {
    const res = await client.get<RatingSummary>(
      `/products/${productId}/rating-summary`
    );
    return res.data;
  },

  checkEligibility: async (
    productId: number
  ): Promise<{ eligible: boolean }> => {
    const res = await client.get<{ eligible: boolean }>(
      `/products/${productId}/review-eligibility`
    );
    return res.data;
  },

  createReview: async (
    productId: number,
    payload: ReviewPayload
  ): Promise<Review> => {
    const res = await client.post<Review>(
      `/products/${productId}/reviews`,
      payload
    );
    return res.data;
  },

  updateReview: async (
    reviewId: number,
    payload: ReviewPayload
  ): Promise<Review> => {
    const res = await client.put<Review>(`/reviews/${reviewId}`, payload);
    return res.data;
  },

  deleteReview: async (reviewId: number): Promise<void> => {
    await client.delete(`/reviews/${reviewId}`);
  },

  getMyReviews: async (page = 0, size = 10): Promise<PageResponse<Review>> => {
    const res = await client.get<PageResponse<Review>>("/users/me/reviews", {
      params: { page, size },
    });
    return res.data;
  },
};
