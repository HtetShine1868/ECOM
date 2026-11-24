import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { productApi } from "../api/products";
import { reviewsApi } from "../api/reviews";
import { recommendationsApi } from "../api/recommendations";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import ProductCard from "../components/product/ProductCard";
import { formatMMK } from "../utils/format";
import { productImageSrc } from "../utils/image";
import type { Product, Review, RatingSummary, RecommendationItem } from "../types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  // Recommendations
  const [frequentlyBought, setFrequentlyBought] = useState<RecommendationItem[]>([]);
  const [related, setRelated] = useState<RecommendationItem[]>([]);

  // Reviews & Rating Summary
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewSort, setReviewSort] = useState("newest");
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [isEligible, setIsEligible] = useState(false);

  // Review Form modal/state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [ratingInput, setRatingInput] = useState<number>(5);
  const [titleInput, setTitleInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [imageUrlsInput, setImageUrlsInput] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Load product and track VIEW
  useEffect(() => {
    if (!productId || isNaN(productId)) return;
    setLoading(true);

    productApi
      .getById(productId)
      .then((item) => {
        setProduct(item);
        // Track VIEW event
        void recommendationsApi.trackEvent(productId, "VIEW");
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));

    // Load recommendations
    recommendationsApi.getFrequentlyBought(productId, 4)
      .then(setFrequentlyBought)
      .catch(() => setFrequentlyBought([]));

    recommendationsApi.getRelated(productId, 4)
      .then(setRelated)
      .catch(() => setRelated([]));

    // Check review eligibility
    if (isAuthenticated) {
      reviewsApi.checkEligibility(productId)
        .then((res) => setIsEligible(res.eligible))
        .catch(() => setIsEligible(false));
    }
  }, [productId, isAuthenticated]);

  // Load rating summary & reviews
  useEffect(() => {
    if (!productId || isNaN(productId)) return;
    reviewsApi.getRatingSummary(productId)
      .then(setRatingSummary)
      .catch(() => setRatingSummary(null));
  }, [productId]);

  const loadReviews = (page: number, sort: string) => {
    if (!productId || isNaN(productId)) return;
    setReviewsLoading(true);
    reviewsApi.getProductReviews(productId, page, 5, sort)
      .then((data) => {
        setReviews(data.content || []);
        setTotalReviews(data.totalElements || 0);
      })
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  };

  useEffect(() => {
    loadReviews(reviewPage, reviewSort);
  }, [productId, reviewPage, reviewSort]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return;
    setSubmittingReview(true);
    setReviewError(null);

    const images = imageUrlsInput
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await reviewsApi.createReview(productId, {
        rating: ratingInput,
        title: titleInput.trim() || undefined,
        comment: commentInput.trim() || undefined,
        imageUrls: images.length > 0 ? images : undefined,
      });

      setShowReviewForm(false);
      setTitleInput("");
      setCommentInput("");
      setImageUrlsInput("");
      setIsEligible(false);

      // Refresh reviews and rating summary
      loadReviews(0, reviewSort);
      const updatedSummary = await reviewsApi.getRatingSummary(productId);
      setRatingSummary(updatedSummary);
    } catch (err: any) {
      setReviewError(err.message || "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const starPercentages = useMemo(() => {
    if (!ratingSummary || ratingSummary.totalReviews === 0) {
      return { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    }
    const tot = ratingSummary.totalReviews;
    return {
      5: Math.round(((ratingSummary.rating5Count || 0) / tot) * 100),
      4: Math.round(((ratingSummary.rating4Count || 0) / tot) * 100),
      3: Math.round(((ratingSummary.rating3Count || 0) / tot) * 100),
      2: Math.round(((ratingSummary.rating2Count || 0) / tot) * 100),
      1: Math.round(((ratingSummary.rating1Count || 0) / tot) * 100),
    };
  }, [ratingSummary]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl animate-pulse">
          <div className="mb-6 h-96 rounded-2xl bg-white/70 dark:bg-surface-800" />
          <div className="mb-4 h-8 w-2/3 rounded bg-white/70 dark:bg-surface-800" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold mb-2">We don’t have that item</h1>
          <Link to="/products" className="font-semibold text-primary-700 hover:underline dark:text-primary-300">
            Back to the shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500 dark:text-stone-400">
          <Link to="/" className="hover:text-primary-700 dark:hover:text-primary-300">Home</Link>
          <span>/</span>
          <Link to="/products" className="hover:text-primary-700 dark:hover:text-primary-300">Shop</Link>
          <span>/</span>
          <span className="min-w-0 break-words text-stone-700 dark:text-stone-200">{product.name}</span>
        </nav>

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <div className="shop-card relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-surface-800 md:aspect-square">
            <img
              src={productImageSrc(product.imageUrl, "https://placehold.co/800x800?text=No+Image")}
              alt={product.name}
              className="absolute inset-0 h-full w-full object-cover object-center"
              onError={(event) => {
                const img = event.currentTarget;
                if (img.dataset.fallback === "1") return;
                img.dataset.fallback = "1";
                img.src = "https://placehold.co/800x800?text=No+Image";
              }}
            />
          </div>

          <div className="flex flex-col">
            {product.category && (
              <span className="mb-2 inline-block w-fit rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/40 dark:text-primary-100">
                {product.category}
              </span>
            )}
            <h1 className="mb-2 break-words font-display text-3xl font-semibold">
              {product.name}
            </h1>

            {/* Star Rating Badge */}
            <div className="mb-4 flex items-center gap-2">
              <div className="flex text-amber-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className="text-lg">
                    {(ratingSummary?.averageRating ?? 0) >= s ? "★" : "☆"}
                  </span>
                ))}
              </div>
              <span className="text-sm font-bold text-stone-800 dark:text-stone-200">
                {Number(ratingSummary?.averageRating ?? 0).toFixed(1)}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                ({ratingSummary?.totalReviews ?? 0} {ratingSummary?.totalReviews === 1 ? "review" : "reviews"})
              </span>
            </div>

            <p className="mb-6 leading-relaxed text-stone-600 dark:text-stone-300">
              {product.description}
            </p>

            <div className="mb-4">
              <span className="font-display text-3xl font-semibold text-primary-700 dark:text-primary-300">
                {formatMMK(product.price)}
              </span>
              {product.cargoPrice > 0 && (
                <span className="ml-3 text-sm text-stone-500 dark:text-stone-400">
                  + {formatMMK(product.cargoPrice)} cargo
                </span>
              )}
            </div>

            <p className={`text-sm font-medium ${product.stock > 0 ? "text-accent-700 dark:text-accent-300" : "text-red-700 dark:text-red-300"} ${product.unitsSold ? "mb-2" : "mb-6"}`}>
              {product.stock > 0 ? `${product.stock} in stock` : "Sold out"}
            </p>
            {product.unitsSold != null && product.unitsSold > 0 && (
              <p className="mb-6 text-sm text-stone-600 dark:text-stone-300">{product.unitsSold} sold</p>
            )}

            <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center rounded-full border border-stone-200 bg-white dark:border-surface-800 dark:bg-surface-800">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-4 py-2 text-lg"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                  className="px-4 py-2 text-lg"
                >
                  +
                </button>
              </div>
              <button
                disabled={product.stock === 0}
                onClick={() => {
                  addItem(product, quantity);
                  void recommendationsApi.trackEvent(product.id, "ADD_TO_CART");
                }}
                className="btn-primary w-full flex-1 py-3"
              >
                Add to bag
              </button>
            </div>
          </div>
        </div>

        {/* ─── Frequently Bought Together ─── */}
        {frequentlyBought.length > 0 && (
          <section className="mt-14 border-t border-stone-200 pt-8 dark:border-surface-800">
            <h2 className="mb-2 font-display text-2xl font-bold">Frequently Bought Together</h2>
            <p className="mb-6 text-xs text-stone-500">Customers who bought this item also purchased:</p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {frequentlyBought.map((item) => (
                <ProductCard key={item.product.id} product={item.product} />
              ))}
            </div>
          </section>
        )}

        {/* ─── Related Products ─── */}
        {related.length > 0 && (
          <section className="mt-14 border-t border-stone-200 pt-8 dark:border-surface-800">
            <h2 className="mb-2 font-display text-2xl font-bold">Related Products</h2>
            <p className="mb-6 text-xs text-stone-500">More items in {product.category || "this category"}:</p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.product.id} product={item.product} />
              ))}
            </div>
          </section>
        )}

        {/* ─── Ratings & Reviews Section ─── */}
        <section className="mt-14 border-t border-stone-200 pt-10 dark:border-surface-800">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-2xl font-bold">Customer Reviews</h2>
              <p className="text-xs text-stone-500">Real feedback from verified purchasers</p>
            </div>

            {isEligible && (
              <button
                onClick={() => setShowReviewForm(!showReviewForm)}
                className="btn-primary py-2 px-5 text-sm"
              >
                {showReviewForm ? "Cancel Review" : "Write a Review"}
              </button>
            )}
          </div>

          {/* Rating Summary & Breakdown Grid */}
          <div className="mb-10 grid gap-8 rounded-2xl bg-stone-50 p-6 dark:bg-surface-800/60 md:grid-cols-3">
            <div className="flex flex-col items-center justify-center border-b border-stone-200 pb-6 dark:border-surface-700 md:border-b-0 md:border-r md:pb-0">
              <span className="font-display text-5xl font-extrabold text-stone-900 dark:text-stone-50">
                {Number(ratingSummary?.averageRating ?? 0).toFixed(1)}
              </span>
              <div className="mt-2 flex text-xl text-amber-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s}>{(ratingSummary?.averageRating ?? 0) >= s ? "★" : "☆"}</span>
                ))}
              </div>
              <span className="mt-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                Based on {ratingSummary?.totalReviews ?? 0} reviews
              </span>
            </div>

            {/* Distribution bars */}
            <div className="space-y-2 md:col-span-2 flex flex-col justify-center">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const pct = starPercentages[star];
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-8 text-stone-600 dark:text-stone-300 font-medium">{star} ★</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-surface-700">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-stone-500 dark:text-stone-400">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Review Submission Form */}
          {showReviewForm && (
            <form
              onSubmit={handleReviewSubmit}
              className="mb-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-surface-700 dark:bg-surface-800"
            >
              <h3 className="mb-4 font-display text-lg font-bold">Write Your Review</h3>

              {reviewError && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300">
                  {reviewError}
                </div>
              )}

              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Rating *
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRatingInput(star)}
                      className={`text-2xl transition ${ratingInput >= star ? "text-amber-500" : "text-stone-300 dark:text-stone-600"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Review Title
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="e.g. Great quality, fits perfectly!"
                  className="w-full rounded-lg border border-stone-300 p-2 text-sm dark:border-surface-600 dark:bg-surface-700"
                />
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Your Review
                </label>
                <textarea
                  rows={4}
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Tell others what you think about this product..."
                  className="w-full rounded-lg border border-stone-300 p-2 text-sm dark:border-surface-600 dark:bg-surface-700"
                />
              </div>

              <div className="mb-6">
                <label className="mb-1 block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Image URLs (optional, one per line)
                </label>
                <textarea
                  rows={2}
                  value={imageUrlsInput}
                  onChange={(e) => setImageUrlsInput(e.target.value)}
                  placeholder="https://example.com/photo1.jpg"
                  className="w-full rounded-lg border border-stone-300 p-2 text-sm font-mono text-xs dark:border-surface-600 dark:bg-surface-700"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReviewForm(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-surface-600 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="btn-primary py-2 px-6 text-xs"
                >
                  {submittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </div>
            </form>
          )}

          {/* Review Filter & Sort Bar */}
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              {totalReviews} {totalReviews === 1 ? "Review" : "Reviews"}
            </span>

            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="review-sort" className="text-stone-500">Sort by:</label>
              <select
                id="review-sort"
                value={reviewSort}
                onChange={(e) => {
                  setReviewSort(e.target.value);
                  setReviewPage(0);
                }}
                className="rounded-lg border border-stone-300 bg-white py-1.5 px-3 text-xs dark:border-surface-600 dark:bg-surface-800"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="highest">Highest Rating</option>
                <option value="lowest">Lowest Rating</option>
              </select>
            </div>
          </div>

          {/* Review List */}
          {reviewsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-28 animate-pulse rounded-xl bg-stone-100 dark:bg-surface-800" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500 dark:border-surface-700">
              No reviews yet. Be the first to review this product after purchase!
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs dark:border-surface-800 dark:bg-surface-800"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                        {rev.userName}
                      </span>
                      {rev.verifiedPurchase && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          ✓ Verified Purchase
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-stone-400">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mb-2 flex text-amber-500 text-sm">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s}>{rev.rating >= s ? "★" : "☆"}</span>
                    ))}
                  </div>

                  {rev.title && (
                    <h4 className="mb-1 text-sm font-bold text-stone-900 dark:text-stone-100">
                      {rev.title}
                    </h4>
                  )}

                  {rev.comment && (
                    <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                      {rev.comment}
                    </p>
                  )}

                  {rev.imageUrls && rev.imageUrls.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rev.imageUrls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt="Review attachment"
                          className="h-16 w-16 rounded-lg object-cover border border-stone-200 dark:border-surface-700"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Pagination controls */}
              {totalReviews > 5 && (
                <div className="flex items-center justify-between pt-4">
                  <button
                    disabled={reviewPage === 0}
                    onClick={() => setReviewPage((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-surface-700"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-stone-500">
                    Page {reviewPage + 1} of {Math.ceil(totalReviews / 5)}
                  </span>
                  <button
                    disabled={(reviewPage + 1) * 5 >= totalReviews}
                    onClick={() => setReviewPage((p) => p + 1)}
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-surface-700"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
