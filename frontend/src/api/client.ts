const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(
  path: string,
  options: RequestInit = {},
  retries = 1
): Promise<T> {
  const token = localStorage.getItem("access_token");

  const isFormData = options.body instanceof FormData;

  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(BASE_URL + path, { ...options, headers });

    if (!res.ok) {
      // If the server is waking up (503) and we have retries left, wait and retry
      if (res.status === 503 && retries > 0) {
        await delay(3000);
        return request<T>(path, options, retries - 1);
      }
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw { message: error.message || "Request failed", status: res.status };
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err: unknown) {
    // Network-level failure (proxy error, server offline, Render cold start)
    if (retries > 0 && (err as { status?: number })?.status === undefined) {
      // Not an HTTP error — it's a network failure, retry after delay
      await delay(3000);
      return request<T>(path, options, retries - 1);
    }
    throw err;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),

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
