import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { User } from "../types";
import api from "../api/client";

interface AuthResponse {
  token: string;
  tokenType: string;
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
  loginWithToken: (token: string) => User;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Decode the payload of a JWT without verifying signature */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function storeAuth(token: string, user: User) {
  localStorage.setItem("access_token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const savedUser = localStorage.getItem("user");
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponse>("/auth/login", { email, password });
    const u: User = {
      id: String(data.userId),
      email: data.email,
      name: data.name,
      role: data.role as User["role"],
      createdAt: new Date().toISOString(),
    };
    storeAuth(data.token, u);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await api.post<AuthResponse>("/auth/register", { name, email, password });
    const u: User = {
      id: String(data.userId),
      email: data.email,
      name: data.name,
      role: data.role as User["role"],
      createdAt: new Date().toISOString(),
    };
    storeAuth(data.token, u);
    setUser(u);
  }, []);

  /** Called from OAuth2 callback page — token comes from URL query param */
  const loginWithToken = useCallback((token: string): User => {
    const payload = decodeJwtPayload(token);
    const u: User = {
      id: String(payload.userId ?? ""),
      email: (payload.sub as string) ?? "",
      name: (payload.name as string) || (payload.sub as string) || "",
      role: (payload.role as User["role"]) ?? "BUYER",
      createdAt: new Date().toISOString(),
    };
    storeAuth(token, u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
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
        loginWithToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
