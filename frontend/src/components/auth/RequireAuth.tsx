import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import ShopMark from "../layout/ShopMark";

export function safeNextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login") || raw.startsWith("/register") || raw.startsWith("/oauth2")) return "/";
  return raw;
}

export function Splash() {
  return (
    <div className="linen flex min-h-screen flex-col items-center justify-center gap-3">
      <ShopMark className="h-12 w-12" />
      <p className="font-display text-lg text-stone-700 dark:text-stone-200">ShopNow</p>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}
