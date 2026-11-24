import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

function homeForRole(role?: string) {
  return role === "ADMIN" ? "/admin" : "/";
}

let pending: Promise<User> | null = null;

export default function OAuth2CallbackPage() {
  const { completeOAuth, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");

    if (code) {
      window.history.replaceState(null, "", window.location.pathname);
      pending = completeOAuth(code);
    } else if (!pending) {
      // If no code and nothing pending, do not call completeOAuth(null) which would fail with 401
      navigate("/login?error=oauth&reason=no_code_provided", { replace: true });
      return;
    }

    let active = true;
    pending
      .then((u) => {
        pending = null;
        if (active) navigate(homeForRole(u.role), { replace: true });
      })
      .catch((err: any) => {
        pending = null;
        if (!active) return;
        if (user) {
          navigate(homeForRole(user.role), { replace: true });
        } else {
          const reasonMsg = err?.message || err?.status || "exchange_failed";
          navigate(`/login?error=oauth&reason=${encodeURIComponent(String(reasonMsg))}`, { replace: true });
        }
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
