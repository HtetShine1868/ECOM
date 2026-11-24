import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { reviewsApi } from "../api/reviews";
import { useAuth } from "../context/AuthContext";
import { ReviewForm } from "../components/reviews/ReviewsSection";
import { Stars } from "../components/ui/Stars";
import { productImageSrc } from "../utils/image";
import type { ApiError } from "../api/client";
import type { Review } from "../types";

export default function AccountPage() {
  const { user, resendVerification, refreshUser } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [mailState, setMailState] = useState<"idle" | "sending" | "sent">("idle");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    reviewsApi
      .getMyReviews(page, 5)
      .then((res) => {
        setReviews(res.content ?? []);
        setPages(res.totalPages ?? 0);
      })
      .catch(() => setError("Your reviews could not be loaded."))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(load, [load]);
  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  if (!user) return null;

  const resend = async () => {
    setMailState("sending");
    try {
      await resendVerification(user.email);
      setMailState("sent");
    } catch {
      setMailState("idle");
    }
  };

  const remove = async (review: Review) => {
    if (!window.confirm("Delete this review? This cannot be undone.")) return;
    try {
      await reviewsApi.deleteReview(review.id);
      setNotice("Review deleted.");
      load();
    } catch (err) {
      setNotice((err as ApiError).message || "Could not delete the review.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="font-display text-3xl font-semibold">Your account</h1>

      <section className="shop-card mt-6 p-5 sm:p-6" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-lg font-semibold">Profile</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-stone-500">Name</dt><dd className="mt-0.5 font-medium">{user.name}</dd></div>
          <div><dt className="text-stone-500">Email</dt><dd className="mt-0.5 break-all font-medium">{user.email}</dd></div>
          <div>
            <dt className="text-stone-500">Email status</dt>
            <dd className="mt-0.5">
              {user.emailVerified ? (
                <span className="inline-flex rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-semibold text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">Verified</span>
              ) : (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">Not verified</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500">Account</dt>
            <dd className="mt-0.5 font-medium capitalize">{(user.accountStatus ?? "ACTIVE").replace("_", " ").toLowerCase()}</dd>
          </div>
        </dl>
        {!user.emailVerified && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">Verify your email to place orders and write reviews.</p>
            <p className="mt-1">We sent a link when you signed up. It works for 24 hours.</p>
            <button onClick={() => void resend()} disabled={mailState !== "idle"} className="btn-primary mt-3 px-4 py-2 text-xs disabled:opacity-60">
              {mailState === "sending" ? "Sending…" : mailState === "sent" ? "Sent. Check your inbox" : "Resend verification email"}
            </button>
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="my-reviews-heading">
        <h2 id="my-reviews-heading" className="font-display text-2xl font-semibold">Your reviews</h2>
        {notice && (
          <p role="status" className="mt-3 rounded-xl bg-accent-100 px-4 py-2 text-sm text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">{notice}</p>
        )}

        {loading ? (
          <div className="mt-4 space-y-3">
            {[0, 1].map((n) => <div key={n} className="h-24 animate-pulse rounded-2xl bg-stone-100 dark:bg-surface-800" />)}
          </div>
        ) : error ? (
          <p className="mt-4 text-sm text-red-700 dark:text-red-300">
            {error} <button className="font-semibold underline" onClick={load}>Try again</button>
          </p>
        ) : reviews.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-600 dark:border-surface-700 dark:text-stone-300">
            You have not reviewed anything yet. Once an order is delivered, you can review it from the product page.
            <br />
            <Link to="/orders" className="mt-2 inline-block font-semibold text-primary-700 underline dark:text-primary-300">View your orders</Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {reviews.map((review) => (
              <li key={review.id} className="shop-card p-4 sm:p-5">
                {editing === review.id ? (
                  <ReviewForm
                    productId={review.productId}
                    existing={review}
                    onCancel={() => setEditing(null)}
                    onSaved={(message) => {
                      setEditing(null);
                      setNotice(message);
                      load();
                    }}
                  />
                ) : (
                  <>
                    <div className="flex gap-3">
                      <img src={productImageSrc(review.productImageUrl, "https://placehold.co/80x80?text=Item")} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <Link to={`/products/${review.productId}`} className="block truncate text-sm font-semibold hover:underline">
                          {review.productName ?? `Product #${review.productId}`}
                        </Link>
                        <div className="mt-1 flex items-center gap-2">
                          <Stars value={review.rating} size={14} />
                          <time className="text-xs text-stone-500" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time>
                        </div>
                      </div>
                    </div>
                    {review.title && <h3 className="mt-3 text-sm font-semibold">{review.title}</h3>}
                    {review.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-700 dark:text-stone-200">{review.comment}</p>}
                    {review.imageUrls && review.imageUrls.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {review.imageUrls.map((url) => (
                          <li key={url}><img src={productImageSrc(url)} alt="" className="h-14 w-14 rounded-lg object-cover" loading="lazy" /></li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex gap-4 text-xs font-semibold">
                      <button className="text-primary-700 hover:underline dark:text-primary-300" onClick={() => setEditing(review.id)}>Edit</button>
                      <button className="text-red-700 hover:underline dark:text-red-300" onClick={() => void remove(review)}>Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="Review pages">
            <button className="btn-secondary px-4 py-1.5 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {pages}</span>
            <button className="btn-secondary px-4 py-1.5 disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </nav>
        )}
      </section>
    </div>
  );
}
