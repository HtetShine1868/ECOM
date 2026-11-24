import api from "./client";
import type { PageResponse, RatingSummary, Review } from "../types";

export interface ReviewPayload {
  rating: number;
  title?: string;
  comment?: string;
  /** URLs returned by uploadImages. */
  imageUrls?: string[];
}

export type EligibilityReason = "OK" | "SIGN_IN" | "NOT_VERIFIED" | "ALREADY_REVIEWED" | "NOT_DELIVERED";

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest";

export const reviewsApi = {
  getProductReviews: (productId: number, page = 0, size = 5, sortBy: ReviewSort = "newest") =>
    api.get<PageResponse<Review>>(`/products/${productId}/reviews?page=${page}&size=${size}&sortBy=${sortBy}`),

  getRatingSummary: (productId: number) => api.get<RatingSummary>(`/products/${productId}/rating-summary`),

  /** Whether the signed-in shopper may review now, and if not, why. */
  checkEligibility: (productId: number) =>
    api.get<{ eligible: boolean; reason: EligibilityReason }>(`/products/${productId}/review-eligibility`),

  createReview: (productId: number, payload: ReviewPayload) => api.post<Review>(`/products/${productId}/reviews`, payload),

  updateReview: (reviewId: number, payload: ReviewPayload) => api.put<Review>(`/reviews/${reviewId}`, payload),

  deleteReview: (reviewId: number) => api.delete<void>(`/reviews/${reviewId}`),

  getMyReviews: (page = 0, size = 10) => api.get<PageResponse<Review>>(`/users/me/reviews?page=${page}&size=${size}`),

  /** Upload photos first, then send the returned URLs with the review. */
  uploadImages: async (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const res = await api.upload<{ urls: string[] }>("/reviews/images", form);
    return res.urls;
  },
};
