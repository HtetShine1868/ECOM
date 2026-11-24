import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

function homeForRole(role?: string) {
  return role === "ADMIN" ? "/admin" : "/";
}

/**
 * Shared across mounts: signing in swaps the signed-out route tree for the
 * signed-in one, which mounts this page a second time. The second mount must
 * wait for the same exchange instead of starting a new one without the code.
 */
let pending: Promise<User> | null = null;

export default function OAuth2CallbackPage() {
  const { completeOAuth, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    // A code in the address bar is a new sign-in; otherwise reuse the one in progress.
    if (code || !pending) {
      // Drop the one-time code (and Facebook's #_=_) from the address bar and history.
      window.history.replaceState(null, "", window.location.pathname);
      pending = completeOAuth(code);
      pending.catch(() => undefined);
    }

    let active = true;
    pending
      .then((u) => active && navigate(homeForRole(u.role), { replace: true }))
      .catch(() => {
        if (!active) return;
        if (user) navigate(homeForRole(user.role), { replace: true });
        else navigate("/login?error=oauth", { replace: true });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="linen flex min-h-dvh items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-sm text-stone-500">Opening the shop...</p>
      </div>
    </div>
  );
}
