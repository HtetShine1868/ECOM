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

export function getOrderStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    CONFIRMED:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    PROCESSING: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    SHIPPED:    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    DELIVERING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    DELIVERED:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    CANCELLED:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return map[status] || "bg-gray-100 text-gray-700";
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