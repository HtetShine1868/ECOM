import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ApiError } from "../api/client";
import { JUST_REGISTERED } from "./RegisterPage";

const COOLDOWN_SECONDS = 60;

/**
 * One in-flight verification per token for the whole app. On a full page load the router first renders
 * the signed-out tree and then swaps to the signed-in tree, which mounts a second copy of this page;
 * a per-component guard would submit the single-use token twice and show "already used".
 */
const attempts = new Map<string, Promise<unknown>>();

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, verifyEmail, resendVerification, refreshUser } = useAuth();

  const justRegistered = Boolean((location.state as { justRegistered?: boolean } | null)?.justRegistered);
  const [verifying, setVerifying] = useState(Boolean(token));
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // The signup email was just sent, so "resend" starts on cooldown (the server enforces the same 60 s).
  const [cooldown, setCooldown] = useState(justRegistered ? COOLDOWN_SECONDS : 0);

  useEffect(() => {
    sessionStorage.removeItem(JUST_REGISTERED); // the signup redirect has done its job
  }, []);

  // Verify once per token, shared by every copy of this page (see `attempts`).
  useEffect(() => {
    if (!token) return;
    let attempt = attempts.get(token);
    if (!attempt) {
      attempt = verifyEmail(token);
      attempts.set(token, attempt);
    }
    let alive = true;
    attempt
      .then(() => {
        if (!alive) return;
        setSuccess(true);
        window.setTimeout(() => navigate("/", { replace: true }), 3000);
      })
      .catch((err: ApiError) => {
        if (alive) setError(err?.message || "This link is invalid or has expired. Request a new one below.");
      })
      .finally(() => {
        if (alive) setVerifying(false);
      });
    return () => {
      alive = false;
    };
  }, [token, verifyEmail, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = user?.email ?? email.trim();

  const handleResend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!target || resending || cooldown > 0) return;
    setResending(true);
    setError(null);
    setResendMessage(null);
    try {
      await resendVerification(target);
      // Same message whether or not an email went out: the server never reveals which addresses exist.
      setResendMessage("If that account still needs verifying, a new link is on its way. Check your inbox and spam folder.");
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError((err as ApiError)?.message || "We could not send the email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const alreadyVerified = Boolean(user?.emailVerified) && !token && !success;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm dark:border-surface-800 dark:bg-surface-800">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            {success || alreadyVerified ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            )}
          </svg>
        </div>

        <h1 className="mb-2 font-display text-2xl font-bold text-stone-900 dark:text-stone-100">
          {verifying ? "Verifying your email…" : success ? "Email verified" : alreadyVerified ? "You're all set" : "Check your email"}
        </h1>

        {user?.email && !success && <p className="mb-4 break-all text-sm font-semibold text-primary-700 dark:text-primary-300">{user.email}</p>}

        {verifying && (
          <div className="my-6" role="status">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
            <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">One moment…</p>
          </div>
        )}

        {success && (
          <div className="my-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" role="status">
            <p className="font-semibold">Your account is active.</p>
            <p className="mt-1 text-xs">Taking you to the shop…</p>
            <Link to="/" replace className="btn-primary mt-4 inline-block px-4 py-2 text-sm">Continue shopping</Link>
          </div>
        )}

        {alreadyVerified && (
          <div className="my-6">
            <p className="text-sm text-stone-600 dark:text-stone-300">Your email is verified. You can check out and write reviews.</p>
            <Link to="/" className="btn-primary mt-4 inline-block px-4 py-2 text-sm">Continue shopping</Link>
          </div>
        )}

        {!verifying && !success && !alreadyVerified && (
          <>
            <p className="mb-6 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              {error
                ? "That link did not work. You can ask for a new one."
                : "We sent you a link. Click it to activate your account so you can check out and write reviews."}
            </p>

            <p className="mb-6 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 dark:border-surface-700 dark:bg-surface-700/50 dark:text-stone-300">
              The link works for <strong>24 hours</strong> and only once. Until then you can still browse and fill your bag.
            </p>

            {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            {resendMessage && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{resendMessage}</p>}

            <form onSubmit={handleResend} className="space-y-3 text-left">
              {!user && (
                <div>
                  <label htmlFor="verify-email-input" className="mb-1 block text-sm font-medium">Your email address</label>
                  <input id="verify-email-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" placeholder="you@example.com" />
                </div>
              )}
              <button type="submit" disabled={resending || cooldown > 0 || !target} className="btn-primary w-full py-2.5 text-sm">
                {resending ? "Sending…" : cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification email"}
              </button>
            </form>

            {user && (
              <button
                type="button"
                onClick={async () => {
                  const fresh = await refreshUser();
                  if (fresh?.emailVerified) setResendMessage(null);
                  else setError("Not verified yet. Open the link in the email we sent.");
                }}
                className="mt-3 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
              >
                I have verified, check again
              </button>
            )}

            <div className="mt-4">
              <Link to="/" className="text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white">Back to the shop</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
