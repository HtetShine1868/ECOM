import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function homeForRole(role?: string) {
  return role === "ADMIN" ? "/admin" : "/";
}

export default function OAuth2CallbackPage() {
  const { completeOAuth } = useAuth();
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    completeOAuth()
      .then((user) => navigate(homeForRole(user.role), { replace: true }))
      .catch(() => navigate("/login?error=oauth", { replace: true }));
  }, [completeOAuth, navigate]);

  return (
    <div className="linen flex min-h-dvh items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-sm text-stone-500">Opening the shop...</p>
      </div>
    </div>
  );
}
