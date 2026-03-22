"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CustomNotificationItem = {
  id: number;
  type: "success" | "error" | "info";
  text: string;
};

interface CustomNotificationProps {
  notifications: CustomNotificationItem[];
  onDismiss: (id: number) => void;
}

const notificationStyles: Record<CustomNotificationItem["type"], string> = {
  success: "border-emerald-500/40 bg-emerald-500/10",
  error: "border-destructive/40 bg-destructive/10",
  info: "border-border bg-card",
};

const iconStyles: Record<CustomNotificationItem["type"], string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
  info: "text-foreground",
};

const textStyles: Record<CustomNotificationItem["type"], string> = {
  success: "text-emerald-700 dark:text-emerald-300",
  error: "text-destructive",
  info: "text-foreground",
};

const icons: Record<CustomNotificationItem["type"], typeof CheckCircle2> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

export function CustomNotification({ notifications, onDismiss }: CustomNotificationProps) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(92vw,26rem)] flex-col gap-2">
      {notifications.map((notification) => {
        const Icon = icons[notification.type];

        return (
          <div
            key={notification.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 text-sm text-foreground ring-1 ring-foreground/5",
              notificationStyles[notification.type]
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", iconStyles[notification.type])} />
            <p className={cn("flex-1 leading-relaxed", textStyles[notification.type])}>{notification.text}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground hover:text-foreground"
              onClick={() => onDismiss(notification.id)}
              aria-label="Dismiss notification"
            >
              <X className="size-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}