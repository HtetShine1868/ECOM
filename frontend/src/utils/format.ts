export function formatMMK(amount: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(amount)) + " MMK";
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getOrderStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING:    "bg-amber-100 text-amber-950 dark:bg-amber-400/15 dark:text-amber-100",
    CONFIRMED:  "bg-primary-100 text-primary-900 dark:bg-primary-400/15 dark:text-primary-100",
    PROCESSING: "bg-orange-100 text-orange-950 dark:bg-orange-400/15 dark:text-orange-100",
    SHIPPED:    "bg-stone-200 text-stone-900 dark:bg-stone-500/20 dark:text-stone-100",
    DELIVERING: "bg-accent-100 text-accent-600 dark:bg-accent-400/20 dark:text-emerald-100",
    DELIVERED:  "bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-100",
    CANCELLED:  "bg-red-100 text-red-950 dark:bg-red-400/15 dark:text-red-100",
  };
  return map[status] || "bg-stone-200 text-stone-900 dark:bg-stone-500/20 dark:text-stone-100";
}

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERING",
  "DELIVERED",
  "CANCELLED",
] as const;