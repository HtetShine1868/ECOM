import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/** A slim reminder for signed-in shoppers whose email is not verified yet. Browsing and the bag keep working. */
export default function VerifyEmailBanner() {
  const { user, isAuthenticated, resendVerification } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !user || user.emailVerified || user.role === "ADMIN" || dismissed) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await resendVerification(user.email);
      setSent(true);
    } catch {
      setSent(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span>{sent ? "Check your inbox for a new link." : "Verify your email to place orders and write reviews."}</span>
        {!sent && (
          <button onClick={() => void resend()} disabled={busy} className="font-semibold underline disabled:opacity-50">
            {busy ? "Sending…" : "Resend email"}
          </button>
        )}
        <Link to="/verify-email" className="font-semibold underline">More help</Link>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="ml-1 text-lg leading-none opacity-60 hover:opacity-100">×</button>
      </div>
    </div>
  );
}
