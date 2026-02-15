"use client";

import type { NotificationUrgency } from "@/stores/notification-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useXpraStore } from "@/stores/xpra-store";
import { X } from "lucide-react";

const URGENCY_BORDER: Record<NotificationUrgency, string> = {
  low: "border-gray-alpha-200",
  normal: "border-gray-alpha-200",
  critical: "border-red-500/50",
};

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-blue-100 text-blue-900",
  warning: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-900",
  critical: "bg-red-200 text-red-900",
};

export function NotificationToasts() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismissNotification = useNotificationStore((s) => s.dismissNotification);
  const client = useXpraStore((s) => s.client);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[9500] flex w-80 flex-col gap-2" role="status" aria-live="polite" aria-label="Notifications">
      {notifications.map((notif) => (
        <div
          key={`${notif.id}-${notif.timestamp}`}
          className={`flex gap-3 rounded-lg border bg-background-100/95 p-3 shadow-lg backdrop-blur-xl ${URGENCY_BORDER[notif.urgency]}`}
          style={{
            animation: "notif-slide-in 200ms ease-out",
          }}
        >
          {notif.icon && (
            <img
              src={notif.icon}
              alt=""
              className="h-8 w-8 shrink-0 rounded"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {(notif.appName || notif.source) && (
                <p className="truncate text-label-12 text-gray-700">
                  {notif.appName || notif.source?.toUpperCase()}
                </p>
              )}
              {notif.severity && (
                <span
                  className={`rounded px-1 py-0.5 text-[10px] uppercase tracking-wide ${SEVERITY_BADGE[notif.severity] ?? "bg-gray-alpha-200 text-gray-900"}`}
                >
                  {notif.severity}
                </span>
              )}
            </div>
            <p className="truncate text-label-13 text-gray-1000">
              {notif.summary}
            </p>
            {notif.body && (
              <p className="mt-0.5 line-clamp-2 text-label-13 text-gray-900">
                {notif.body}
              </p>
            )}
          </div>
          <button
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-800 transition-colors hover:bg-gray-alpha-200 hover:text-gray-1000"
            onClick={() => {
              dismissNotification(notif.id);
              client?.sendNotificationClose(notif.id);
            }}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
