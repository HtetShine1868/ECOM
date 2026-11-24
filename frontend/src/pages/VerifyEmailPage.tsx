import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { user, verifyEmail, resendVerification } = useAuth();

  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Auto-verify if token is present in URL
  useEffect(() => {
    if (!token) return;
    setVerifying(true);
    setError(null);

    verifyEmail(token)
      .then(() => {
        setSuccess(true);
        setTimeout(() => {
          navigate("/");
        }, 3000);
      })
      .catch((err: any) => {
        setError(err.message || "Failed to verify email. The token may be invalid or expired.");
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [token, verifyEmail, navigate]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    const emailToUse = user?.email;
    if (!emailToUse) {
      setError("Please sign in or provide your email to resend verification.");
      return;
    }

    setResending(true);
    setError(null);
    setResendMessage(null);

    try {
      await resendVerification(emailToUse);
      setResendMessage("Verification email sent! Check your inbox.");
      setCooldown(60);
    } catch (err: any) {
      setError(err.message || "Failed to resend verification email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-stone-200 dark:border-surface-800 dark:bg-surface-800 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="mb-2 font-display text-2xl font-bold text-stone-900 dark:text-stone-100">
          {verifying ? "Verifying Your Email..." : success ? "Email Verified!" : "Verify Your Email"}
        </h1>

        {user?.email && (
          <p className="mb-4 text-sm font-semibold text-primary-700 dark:text-primary-300">
            {user.email}
          </p>
        )}

        {verifying && (
          <div className="my-6">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
            <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">Validating your security token...</p>
          </div>
        )}

        {success && (
          <div className="my-6 rounded-xl bg-emerald-50 p-4 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
            <p className="font-semibold">Account activated successfully!</p>
            <p className="mt-1 text-xs">Redirecting you to the shop in a few seconds...</p>
            <div className="mt-4">
              <Link to="/" className="btn-primary inline-block text-sm py-2 px-4">
                Continue Shopping
              </Link>
            </div>
          </div>
        )}

        {!verifying && !success && (
          <>
            <p className="mb-6 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              Check your email to verify your account. Click the verification link we sent you to activate full access to checkout and reviews.
            </p>

            <div className="mb-6 rounded-lg bg-stone-50 p-3 text-xs text-stone-500 border border-stone-200 dark:bg-surface-700/50 dark:text-stone-400 dark:border-surface-700">
              ⏱ The verification link expires after <strong>24 hours</strong>.
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800">
                {error}
              </div>
            )}

            {resendMessage && (
              <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                {resendMessage}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="btn-primary w-full py-2.5 text-sm disabled:opacity-50"
              >
                {resending
                  ? "Sending..."
                  : cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : "Resend Verification Email"}
              </button>

              <Link
                to="/"
                className="inline-block text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
              >
                Return to Home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
