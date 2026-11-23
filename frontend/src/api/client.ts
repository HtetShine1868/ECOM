import { API_URL } from "./config";
import { assertSqlSafe } from "../utils/sqlSafe";

const BASE_URL = API_URL;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ApiError = {
  code?: string;
  message: string;
  status?: number;
  details?: Record<string, any>;
  requestId?: string;
};

function isApiError(err: unknown): err is ApiError {
  return typeof err === "object" && err !== null && "message" in err;
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function messageFromBody(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("<")) {
    return "Your session has ended. Please sign in again.";
  }
  try {
    const error = JSON.parse(trimmed) as {
      message?: string;
      validationErrors?: Record<string, string>;
    };
    if (error.validationErrors) {
      const details = Object.values(error.validationErrors).filter(Boolean);
      if (details.length > 0) return details.join(" ");
    }
    if (error.message) return error.message;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Safe to repeat automatically: reads, and checkout (protected by its idempotency key). */
function canAutoRetry(path: string, options: RequestInit) {
  const method = (options.method ?? "GET").toUpperCase();
  return method === "GET" || path === "/orders";
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  requestedRetries = 1
): Promise<T> {
  const retries = canAutoRetry(path, options) ? requestedRetries : 0;
  const isFormData = options.body instanceof FormData;
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  if (query) {
    for (const value of new URLSearchParams(query).values()) {
      assertSqlSafe(value);
    }
  }
  if (!isFormData && typeof options.body === "string" && options.body.trim()) {
    assertSqlSafe(JSON.parse(options.body));
  }

  const headers: HeadersInit = {
    Accept: "application/json",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(BASE_URL + path, {
      ...options,
      headers,
      credentials: "include",
      redirect: "manual",
    });

    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      throw { message: "Your session has ended. Please sign in again.", status: 401 } satisfies ApiError;
    }

    const text = await readBody(res);

    if (!res.ok) {
      if (res.status === 503 && retries > 0 && !text.includes("CART_UNAVAILABLE")) {
        await delay(3000);
        return request<T>(path, options, retries - 1);
      }
      let errorData: any = {};
      try {
        errorData = JSON.parse(text);
      } catch {}

      throw {
        code: errorData.code,
        message: messageFromBody(text, res.statusText || "Request failed"),
        status: res.status,
        details: errorData.details,
        requestId: errorData.requestId,
      } satisfies ApiError;
    }

    if (res.status === 204 || text.trim() === "") return undefined as T;
    if (text.trim().startsWith("<")) {
      throw {
        message: "Your session has ended. Please sign in again.",
        status: res.status,
      } satisfies ApiError;
    }
    return JSON.parse(text) as T;
  } catch (err: unknown) {
    if (retries > 0 && !isApiError(err)) {
      await delay(3000);
      return request<T>(path, options, retries - 1);
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string, retries = 1) => request<T>(path, {}, retries),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),

  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
};

export default api;
