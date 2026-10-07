const PROJECT_HOST = /^(https:\/\/[a-z0-9-]+)\.supabase\.co(?=\/)/i;

/** The project API host refuses connections on this network. Public files load from the storage host. */
export function productImageSrc(url?: string | null, fallback = ""): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return fallback;
  return trimmed.replace(PROJECT_HOST, "$1.storage.supabase.co");
}
