import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function homeForRole(role?: string) {
  return role === "ADMIN" ? "/admin" : "/";
}

export default function OAuth2CallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const token = searchParams.get("token");
    if (!token) {
      navigate("/login?error=oauth", { replace: true });
      return;
    }

    const user = loginWithToken(token);
    navigate(homeForRole(user.role), { replace: true });
  }, [loginWithToken, navigate, searchParams]);

  return (
    <div className="bg-surface-50 dark:bg-surface-900 min-h-screen flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="inline-block w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Completing sign-in...</p>
      </div>
    </div>
  );
}
