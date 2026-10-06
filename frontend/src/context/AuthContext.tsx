import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { User } from "../types";
import api from "../api/client";

interface AuthResponse {
  userId: number;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<void>;
  completeOAuth: () => Promise<User>;
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

  useEffect(() => {
    clearLegacyTokens();
    api
      .get<AuthResponse>("/auth/me")
      .then((data) => setUser(toUser(data)))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponse>("/auth/login", { email, password });
    const next = toUser(data);
    setUser(next);
    return next;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await api.post<AuthResponse>("/auth/register", { name, email, password });
    setUser(toUser(data));
  }, []);

  const completeOAuth = useCallback(async () => {
    const data = await api.get<AuthResponse>("/auth/me");
    const next = toUser(data);
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(() => {
    void api.post("/auth/logout").catch(() => undefined);
    clearLegacyTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "ADMIN",
        loading,
        login,
        register,
        completeOAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
