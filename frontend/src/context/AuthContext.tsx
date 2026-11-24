import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { User } from "../types";
import api, { setAuthToken } from "../api/client";

interface AuthResponse {
  userId: number;
  email: string;
  name: string;
  role: string;
  emailVerified?: boolean;
  accountStatus?: "ACTIVE" | "PENDING_EMAIL" | "SUSPENDED";
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isEmailVerified: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  verifyEmail: (token: string) => Promise<User>;
  resendVerification: (email: string) => Promise<void>;
  completeOAuth: (code?: string | null) => Promise<User>;
  /** Re-read the signed-in user from the server (verification status can change in another tab). */
  refreshUser: () => Promise<User | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function toUser(data: AuthResponse): User {
  return {
    id: String(data.userId),
    email: data.email,
    name: data.name,
    role: data.role as User["role"],
    emailVerified: data.emailVerified ?? false,
    accountStatus: data.accountStatus ?? "ACTIVE",
    createdAt: new Date().toISOString(),
  };
}

function clearLegacyTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionGen = useRef(0);

  useEffect(() => {
    const gen = sessionGen.current;
    clearLegacyTokens();
    api
      .get<AuthResponse>("/auth/me", 0)
      .then((data) => {
        if (sessionGen.current !== gen) return;
        setUser(toUser(data));
      })
      .catch((err: { status?: number }) => {
        if (err?.status === 401) setAuthToken(null);
        if (sessionGen.current !== gen) return;
        setUser(null);
      })
      .finally(() => {
        if (sessionGen.current !== gen) return;
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    sessionGen.current += 1;
    setAuthToken(null); // a password session uses the cookie, not an old social-login token
    const data = await api.post<AuthResponse>("/auth/login", { email, password });
    const next = toUser(data);
    setUser(next);
    setLoading(false);
    return next;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    sessionGen.current += 1;
    setAuthToken(null); // a password session uses the cookie, not an old social-login token
    const data = await api.post<AuthResponse>("/auth/register", { name, email, password });
    const next = toUser(data);
    setUser(next);
    setLoading(false);
    return next;
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    sessionGen.current += 1;
    setAuthToken(null); // a password session uses the cookie, not an old social-login token
    const data = await api.post<AuthResponse>("/auth/verify-email", { token });
    const next = toUser(data);
    setUser(next);
    setLoading(false);
    return next;
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    await api.post("/auth/resend-verification", { email });
  }, []);

  const completeOAuth = useCallback(async (code?: string | null) => {
    sessionGen.current += 1;
    let data: AuthResponse;
    if (code) {
      const exchanged = await api.post<AuthResponse & { token?: string }>("/auth/oauth/exchange", { code });
      if (exchanged.token) setAuthToken(exchanged.token);
      data = exchanged;
    } else {
      data = await api.get<AuthResponse>("/auth/me");
    }
    const next = toUser(data);
    setUser(next);
    setLoading(false);
    return next;
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const next = toUser(await api.get<AuthResponse>("/auth/me", 0));
      setUser(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    sessionGen.current += 1;
    setAuthToken(null);
    void api.post("/auth/logout").catch(() => undefined);
    clearLegacyTokens();
    setUser(null);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "ADMIN",
        isEmailVerified: Boolean(user?.emailVerified),
        loading,
        login,
        register,
        verifyEmail,
        resendVerification,
        completeOAuth,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
