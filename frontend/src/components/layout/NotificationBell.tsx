import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notificationApi, type AppNotification } from "../../api/notifications";
import { useAuth } from "../../context/AuthContext";

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(() => {
    notificationApi
      .unreadCount()
      .then((data) => setUnread(data.count ?? 0))
      .catch(() => setUnread(0));
  }, []);

  const refreshList = useCallback(() => {
    setLoading(true);
    notificationApi
      .list()
      .then((data) => {
        const next = Array.isArray(data) ? data : [];
        setItems(next);
        setUnread(next.filter((item) => !item.read).length);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, 12000);
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!open) return;
    refreshList();
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, refreshList]);

  async function openItem(item: AppNotification) {
    setOpen(false);
    if (!item.read) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
      setUnread((count) => Math.max(0, count - 1));
      try {
        await notificationApi.markRead(item.id);
      } catch {
        refreshCount();
      }
    }
    if (!item.orderId) return;
    if (item.type === "NEW_ORDER" && isAdmin) {
      navigate("/admin?order=" + item.orderId);
      return;
    }
    navigate("/receipt/" + item.orderId);
  }

  async function markAll() {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnread(0);
    try {
      await notificationApi.markAllRead();
    } catch {
      refreshList();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-full p-2 text-stone-600 hover:bg-white dark:text-stone-200 dark:hover:bg-surface-800"
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0h6z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-shop dark:border-surface-700 dark:bg-surface-900">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-surface-800">
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">Notifications</p>
              <p className="text-xs text-stone-500">
                {isAdmin ? "New orders show up here." : "Order updates show up here."}
              </p>
            </div>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-semibold text-primary-700 dark:text-primary-300">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-stone-500">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className={`flex w-full flex-col items-start gap-1 border-b border-stone-100 px-4 py-3 text-left last:border-0 hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-800 ${
                    item.read ? "" : "bg-primary-50/70 dark:bg-primary-900/20"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">{item.title}</span>
                    <span className="shrink-0 text-[11px] text-stone-400">{timeAgo(item.createdAt)}</span>
                  </span>
                  <span className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">{item.message}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
