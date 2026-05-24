import { useEffect, useState, useCallback } from "react";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  body?: string;
  duration?: number;
}

let _addToast: ((toast: Omit<Toast, "id">) => void) | null = null;

/** Call this from anywhere to show a toast notification */
export function showToast(toast: Omit<Toast, "id">) {
  _addToast?.(toast);
}

/** Request browser notification permission and show a native notification */
export async function showBrowserNotification(title: string, body?: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  }
}

export function NotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const duration = toast.duration ?? 4000;
    setToasts((prev) => [...prev, { ...toast, id }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, []);

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
          <div className="toast-icon" aria-hidden="true">
            {toast.type === "success" && "✅"}
            {toast.type === "error" && "❌"}
            {toast.type === "warning" && "⚠️"}
            {toast.type === "info" && "ℹ️"}
          </div>
          <div className="toast-content">
            <strong className="toast-title">{toast.title}</strong>
            {toast.body && <p className="toast-body">{toast.body}</p>}
          </div>
          <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">×</button>
        </div>
      ))}
    </div>
  );
}
