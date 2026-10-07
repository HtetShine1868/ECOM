const DEV_BACKEND = "http://localhost:8080";
const PROD_BACKEND = "https://ecom-d3vm.onrender.com";

function trimSlash(value: string) {
  return value.replace(/\/$/, "");
}

/** Host that sets the auth cookie. OAuth and API calls must use this same host. */
export const BACKEND_URL = trimSlash(
  import.meta.env.VITE_BACKEND_URL ||
    (import.meta.env.DEV ? DEV_BACKEND : PROD_BACKEND)
);

/**
 * Call the API on the backend host, not the storefront `/api` path.
 * A storefront rewrite answers protected calls with the login page
 * (`<!doctype html>`), which cannot be parsed as JSON.
 */
export const API_URL = trimSlash(
  import.meta.env.VITE_API_URL || `${BACKEND_URL}/api`
);
