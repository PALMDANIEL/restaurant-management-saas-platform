"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Bell, Package, ShoppingBag, UserPlus, AlertTriangle } from "lucide-react";

type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

const ICONS: Record<string, typeof Bell> = {
  new_order: ShoppingBag,
  low_stock: AlertTriangle,
  out_of_stock: Package,
  new_sale: ShoppingBag,
  new_customer: UserPlus,
  system: Bell,
};

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      return res.json();
    },
    refetchInterval: 8000,
  });

  const notifs: Notification[] = data?.notifications ?? [];

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Notifications</p>
        <button onClick={markAllRead} className="text-xs text-primary hover:underline">
          Tout marquer comme lu
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Chargement...</p>}
        {!isLoading && notifs.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucune notification</p>
        )}
        {notifs.map((n) => {
          const Icon = ICONS[n.type] ?? Bell;
          return (
            <div
              key={n.id}
              className={`flex gap-3 border-b border-border px-4 py-3 last:border-0 ${
                !n.read ? "bg-primary/5" : ""
              }`}
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="truncate text-xs text-muted-foreground">{n.message}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDate(n.createdAt, true)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
