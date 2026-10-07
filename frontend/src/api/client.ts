import { API_URL } from "./config";

const BASE_URL = API_URL;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ApiError = { message: string; status?: number };

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
    return "Please sign in again, then save the product.";
  }
  try {
    const error = JSON.parse(trimmed) as { message?: string };
    return error.message || fallback;
  } catch {
    return fallback;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retries = 1
): Promise<T> {
  const isFormData = options.body instanceof FormData;

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
      throw { message: "Please sign in again, then save the product.", status: 401 } satisfies ApiError;
    }

    const text = await readBody(res);

    if (!res.ok) {
      if (res.status === 503 && retries > 0) {
        await delay(3000);
        return request<T>(path, options, retries - 1);
      }
      throw {
        message: messageFromBody(text, res.statusText || "Request failed"),
        status: res.status,
      } satisfies ApiError;
    }

    if (res.status === 204 || text.trim() === "") return undefined as T;
    if (text.trim().startsWith("<")) {
      throw {
        message: "Please sign in again, then save the product.",
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
  get: <T>(path: string) => request<T>(path),

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
