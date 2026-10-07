import api from "./client";

export interface AppNotification {
  id: number;
  type: "NEW_ORDER" | "ORDER_STATUS" | string;
  title: string;
  message: string;
  orderId: number | null;
  read: boolean;
  createdAt: string;
}

export const notificationApi = {
  list: () => api.get<AppNotification[]>("/notifications"),
  unreadCount: () => api.get<{ count: number }>("/notifications/unread-count"),
  markRead: (id: number) => api.put<void>("/notifications/" + id + "/read", {}),
  markAllRead: () => api.put<void>("/notifications/read-all", {}),
};
