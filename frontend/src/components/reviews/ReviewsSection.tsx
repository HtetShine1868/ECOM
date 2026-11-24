import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { reviewsApi } from "../../api/reviews";
import type { EligibilityReason, ReviewSort } from "../../api/reviews";
import type { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { productImageSrc } from "../../utils/image";
import { StarInput, Stars } from "../ui/Stars";
import type { RatingSummary, Review } from "../../types";

const MAX_PHOTOS = 4;
const MAX_PHOTO_MB = 5;
const PAGE_SIZE = 5;

const SORTS: { value: ReviewSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest", label: "Highest rating" },
  { value: "lowest", label: "Lowest rating" },
];

interface Props {
  productId: number;
  /** Called after a review is created, edited or deleted, so the page can refresh its rating. */
  onChanged?: () => void;
}

export default function ReviewsSection({ productId, onChanged }: Props) {
  const { isAuthenticated, user } = useAuth();
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reason, setReason] = useState<EligibilityReason>("SIGN_IN");
  const [mine, setMine] = useState<Review | null>(null);
  const [form, setForm] = useState<"closed" | "create" | "edit">("closed");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback(() => {
    reviewsApi.getRatingSummary(productId).then(setSummary).catch(() => setSummary(null));
  }, [productId]);

  const loadReviews = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    reviewsApi
      .getProductReviews(productId, page, PAGE_SIZE, sort)
      .then((data) => {
        setReviews(data.content ?? []);
        setTotalPages(data.totalPages ?? 0);
      })
      .catch(() => {
        setReviews([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [productId, page, sort]);

  const loadMine = useCallback(() => {
    if (!isAuthenticated) {
      setReason("SIGN_IN");
      setMine(null);
      return;
    }
    reviewsApi
      .checkEligibility(productId)
      .then((res) => setReason(res.reason))
      .catch(() => setReason("NOT_DELIVERED"));
    reviewsApi
      .getMyReviews(0, 50)
      .then((res) => setMine((res.content ?? []).find((r) => r.productId === productId) ?? null))
      .catch(() => setMine(null));
  }, [isAuthenticated, productId]);

  useEffect(loadSummary, [loadSummary]);
  useEffect(loadReviews, [loadReviews]);
  useEffect(loadMine, [loadMine]);
  useEffect(() => setPage(0), [productId, sort]);

  const refreshAll = () => {
    loadSummary();
    loadReviews();
    loadMine();
    onChanged?.();
  };

  const total = summary?.totalReviews ?? 0;
  const average = Number(summary?.averageRating ?? 0);
  const distribution = useMemo(() => {
    const counts = [summary?.rating5Count, summary?.rating4Count, summary?.rating3Count, summary?.rating2Count, summary?.rating1Count].map((c) => c ?? 0);
    return counts.map((count, i) => ({ stars: 5 - i, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }, [summary, total]);

  const remove = async (review: Review) => {
    if (!window.confirm("Delete your review? This cannot be undone.")) return;
    try {
      await reviewsApi.deleteReview(review.id);
      setNotice("Your review was deleted.");
      refreshAll();
    } catch (err) {
      setNotice((err as ApiError).message || "Could not delete the review.");
    }
  };

  return (
    <section className="mt-14 border-t border-stone-200 pt-10 dark:border-surface-800" aria-labelledby="reviews-heading" ref={topRef}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-heading" className="font-display text-2xl font-bold">Customer reviews</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">From people who bought and received this product.</p>
        </div>
        {form === "closed" && <WriteAction reason={reason} mine={mine} onWrite={() => setForm("create")} onEdit={() => setForm("edit")} />}
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-accent-100 px-4 py-2 text-sm text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
          {notice}
        </p>
      )}

      {form !== "closed" && (
        <ReviewForm
          productId={productId}
          existing={form === "edit" ? mine : null}
          onCancel={() => setForm("closed")}
          onSaved={(message) => {
            setForm("closed");
            setNotice(message);
            setPage(0);
            setSort("newest");
            refreshAll();
            topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      <div className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="shop-card h-fit p-5">
          <div className="flex items-end gap-2">
            <span className="font-display text-5xl font-semibold leading-none">{total > 0 ? average.toFixed(1) : "–"}</span>
            <span className="pb-1 text-sm text-stone-500">/ 5</span>
          </div>
          <div className="mt-2"><Stars value={average} size={18} /></div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            {total === 0 ? "No reviews yet" : `${total} ${total === 1 ? "review" : "reviews"}`}
          </p>
          <ul className="mt-4 space-y-1.5" aria-label="Rating distribution">
            {distribution.map((row) => (
              <li key={row.stars} className="flex items-center gap-2 text-xs">
                <span className="w-6 shrink-0 tabular-nums text-stone-600 dark:text-stone-300">{row.stars} ★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${row.percent}%` }} />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-stone-500">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          {total > 1 && (
            <div className="mb-4 flex items-center justify-end gap-2 text-sm">
              <label htmlFor="review-sort" className="text-stone-600 dark:text-stone-300">Sort by</label>
              <select id="review-sort" value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm dark:border-surface-800 dark:bg-surface-800">
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">{[0, 1].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-stone-100 dark:bg-surface-800" />)}</div>
          ) : loadError ? (
            <p className="rounded-2xl border border-red-200 p-4 text-sm text-red-700 dark:border-red-900 dark:text-red-300">
              Reviews could not be loaded. <button className="font-semibold underline" onClick={loadReviews}>Try again</button>
            </p>
          ) : reviews.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-600 dark:border-surface-700 dark:text-stone-300">
              No reviews yet. Be the first to share how it is once you have received it.
            </p>
          ) : (
            <ul className="space-y-4">
              {reviews.map((review) => (
                <li key={review.id} className="shop-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Stars value={review.rating} size={15} />
                      {review.title && <h3 className="text-sm font-semibold">{review.title}</h3>}
                    </div>
                    <time className="text-xs text-stone-500" dateTime={review.createdAt}>
                      {new Date(review.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      {review.updatedAt && Math.abs(new Date(review.updatedAt).getTime() - new Date(review.createdAt).getTime()) > 60_000 ? " · edited" : ""}
                    </time>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                    <span className="font-medium">{review.userName}</span>
                    {review.verifiedPurchase && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 font-semibold text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        Verified purchase
                      </span>
                    )}
                  </p>
                  {review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700 dark:text-stone-200">{review.comment}</p>}
                  {review.imageUrls && review.imageUrls.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {review.imageUrls.map((url) => (
                        <li key={url}>
                          <button type="button" onClick={() => setLightbox(url)} className="block overflow-hidden rounded-lg ring-1 ring-stone-200 hover:ring-primary-400 dark:ring-surface-700" aria-label="View photo larger">
                            <img src={productImageSrc(url)} alt="Photo from the reviewer" className="h-16 w-16 object-cover" loading="lazy" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {user && String(review.userId) === user.id && (
                    <div className="mt-3 flex gap-3 text-xs font-semibold">
                      <button className="text-primary-700 hover:underline dark:text-primary-300" onClick={() => { setForm("edit"); topRef.current?.scrollIntoView({ behavior: "smooth" }); }}>Edit</button>
                      <button className="text-red-700 hover:underline dark:text-red-300" onClick={() => void remove(review)}>Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="Review pages">
              <button className="btn-secondary px-4 py-1.5 disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="text-stone-600 dark:text-stone-300">Page {page + 1} of {totalPages}</span>
              <button className="btn-secondary px-4 py-1.5 disabled:opacity-40" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </nav>
          )}
        </div>
      </div>

      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label="Review photo" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <img src={productImageSrc(lightbox)} alt="Review" className="max-h-full max-w-full rounded-xl" />
          <button className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold" onClick={() => setLightbox(null)}>Close</button>
        </div>
      )}
    </section>
  );
}

function WriteAction({ reason, mine, onWrite, onEdit }: { reason: EligibilityReason; mine: Review | null; onWrite: () => void; onEdit: () => void }) {
  if (reason === "OK") return <button className="btn-primary" onClick={onWrite}>Write a review</button>;
  if (reason === "ALREADY_REVIEWED" && mine) return <button className="btn-secondary" onClick={onEdit}>Edit your review</button>;
  const text: Record<string, React.ReactNode> = {
    SIGN_IN: <><Link to="/login" className="font-semibold text-primary-700 underline dark:text-primary-300">Sign in</Link> to review products you have bought.</>,
    NOT_VERIFIED: <><Link to="/verify-email" className="font-semibold text-primary-700 underline dark:text-primary-300">Verify your email</Link> to write reviews.</>,
    ALREADY_REVIEWED: "You have already reviewed this product.",
    NOT_DELIVERED: "You can review this after an order containing it is delivered.",
  };
  return <p className="max-w-xs text-right text-sm text-stone-600 dark:text-stone-300">{text[reason]}</p>;
}

interface FormProps {
  productId: number;
  existing: Review | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}

export function ReviewForm({ productId, existing, onCancel, onSaved }: FormProps) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [keptUrls, setKeptUrls] = useState<string[]>(existing?.imageUrls ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("Photos must be JPEG, PNG or WebP.");
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) return setError(`Each photo must be under ${MAX_PHOTO_MB} MB.`);
      if (keptUrls.length + next.length >= MAX_PHOTOS) return setError(`You can add up to ${MAX_PHOTOS} photos.`);
      next.push(file);
    }
    setError("");
    setFiles(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (rating < 1) return setError("Choose a star rating.");
    setBusy(true);
    setError("");
    try {
      const uploaded = files.length > 0 ? await reviewsApi.uploadImages(files) : [];
      const payload = { rating, title: title.trim() || undefined, comment: comment.trim() || undefined, imageUrls: [...keptUrls, ...uploaded] };
      if (existing) await reviewsApi.updateReview(existing.id, payload);
      else await reviewsApi.createReview(productId, payload);
      onSaved(existing ? "Your review was updated." : "Thanks! Your review is now live.");
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.code === "EMAIL_NOT_VERIFIED" ? "Please verify your email address before reviewing." : e2.message || "Your review could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="shop-card mb-8 space-y-4 p-5" aria-label={existing ? "Edit your review" : "Write a review"}>
      <h3 className="font-display text-lg font-semibold">{existing ? "Edit your review" : "Write a review"}</h3>
      <div>
        <p className="mb-1 text-sm font-medium">Your rating</p>
        <StarInput value={rating} onChange={setRating} />
      </div>
      <div>
        <label htmlFor="rv-title" className="mb-1 block text-sm font-medium">Title <span className="font-normal text-stone-500">(optional)</span></label>
        <input id="rv-title" className="field" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sum it up in a few words" />
      </div>
      <div>
        <label htmlFor="rv-comment" className="mb-1 block text-sm font-medium">Your review <span className="font-normal text-stone-500">(optional)</span></label>
        <textarea id="rv-comment" className="field resize-y p-3" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you like or dislike? How did you use it?" />
        <p className="mt-1 text-right text-xs text-stone-500">{comment.length}/2000</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Photos <span className="font-normal text-stone-500">(optional, up to {MAX_PHOTOS})</span></p>
        <div className="flex flex-wrap gap-2">
          {keptUrls.map((url) => (
            <Thumb key={url} src={productImageSrc(url)} onRemove={() => setKeptUrls((u) => u.filter((x) => x !== url))} />
          ))}
          {previews.map((src, i) => (
            <Thumb key={src} src={src} onRemove={() => setFiles((f) => f.filter((_, idx) => idx !== i))} />
          ))}
          {keptUrls.length + files.length < MAX_PHOTOS && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-stone-300 text-2xl text-stone-400 hover:border-primary-400 hover:text-primary-600 dark:border-surface-700">
              +
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <span className="sr-only">Add photos</span>
            </label>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : existing ? "Save changes" : "Post review"}</button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <span className="relative inline-block">
      <img src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
      <button type="button" onClick={onRemove} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-xs text-white">×</button>
    </span>
  );
}
