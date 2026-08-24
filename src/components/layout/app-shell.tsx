"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { NAV_ITEMS } from "@/lib/nav-config";
import { can } from "@/lib/rbac";
import { useAppStore } from "@/store/app-store";
import { useSession } from "@/hooks/use-session";
import { useOrderNotificationChime } from "@/hooks/use-order-notification-chime";
import { cn, initials, ROLE_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import {
  Menu,
  X,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  Bell,
  MoreHorizontal,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { NotificationsPanel } from "./notifications-panel";

type Notification = { id: number; type: string; read: boolean };

export function AppShell({ children }: { children: React.ReactNode }) {
  useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [venueMenuOpen, setVenueMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Rafraîchi toutes les 8s, partagé avec NotificationsPanel (même queryKey) : sert au badge
  // rouge ET déclenche le bip sonore pour tout le personnel connecté, sur n'importe quel écran.
  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await fetch("/api/notifications")).json(),
    refetchInterval: 8000,
  });
  const notifications: Notification[] = notifData?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;
  useOrderNotificationChime(notifications);

  const user = useAppStore((s) => s.user);
  const venues = useAppStore((s) => s.venues);
  const selectedVenueId = useAppStore((s) => s.selectedVenueId);
  const setSelectedVenueId = useAppStore((s) => s.setSelectedVenueId);

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(user?.role as never)) return false;
    if (item.permission && !can(user?.role, item.permission)) return false;
    return true;
  });

  const selectedVenue = venues.find((v) => v.id === selectedVenueId);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Déconnexion réussie");
    router.push("/login");
    router.refresh();
  }

  const mobileNav = visibleNav.slice(0, 4);
  const hasMore = visibleNav.length > 4;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 transform border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-out lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border/70 px-5">
          <div className="flex items-center gap-2.5 font-display font-semibold text-white">
            <Image
              src="/dani-mak-logo.png"
              alt="Dani Mak"
              width={34}
              height={34}
              className="rounded-full ring-2 ring-white/10"
            />
            <span className="text-[15px] tracking-tight">Dani Mak</span>
          </div>
          <button
            className="rounded-lg p-1.5 text-sidebar-foreground/70 hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex h-[calc(100vh-4rem)] flex-col gap-0.5 overflow-y-auto px-3 py-3">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "text-sidebar-foreground/85 hover:bg-white/[0.07] hover:text-white"
                )}
              >
                {active && (
                  <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className={cn("h-[17px] w-[17px] shrink-0", active ? "" : "text-sidebar-foreground/50 group-hover:text-white")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card/85 px-3 pt-safe backdrop-blur-md sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              className="rounded-lg p-2 hover:bg-muted lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative min-w-0">
              <button
                onClick={() => setVenueMenuOpen((o) => !o)}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-muted px-2.5 py-2 text-sm font-medium sm:px-3"
              >
                <Store className="h-4 w-4 shrink-0 text-primary" />
                <span className="max-w-[38vw] truncate sm:max-w-[220px]">
                  {selectedVenueId === "all"
                    ? "Tous les maquis"
                    : selectedVenue?.name || "Sélectionner"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {venueMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 rounded-xl border border-border bg-card p-1 shadow-lg z-30 animate-rise">
                  {(user?.role === "super_admin" || user?.role === "gerant") && (
                    <button
                      onClick={() => {
                        setSelectedVenueId("all");
                        setVenueMenuOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                        selectedVenueId === "all" && "bg-primary/10 font-semibold text-primary-strong"
                      )}
                    >
                      🏢 Tous les maquis réunis
                    </button>
                  )}
                  {venues.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelectedVenueId(v.id);
                        setVenueMenuOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                        selectedVenueId === v.id && "bg-primary/10 font-semibold text-primary-strong"
                      )}
                    >
                      🍽️ {v.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted"
              title="Basculer thème clair/sombre"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
            </div>
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 hover:bg-muted sm:px-2"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {user ? initials(user.firstName, user.lastName) : "--"}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-xs font-semibold leading-tight">
                    {user ? `${user.firstName} ${user.lastName}` : "..."}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {user ? ROLE_LABELS[user.role] : ""}
                  </p>
                </div>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card p-1 shadow-lg z-30 animate-rise">
                  <Link
                    href="/settings"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Paramètres
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" /> Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6 animate-in-fade">{children}</main>

        {/* Mobile bottom tab bar — reach-friendly nav for staff on the floor */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 pb-safe backdrop-blur-md lg:hidden">
          {mobileNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "fill-primary/15")} />
                <span className="max-w-[64px] truncate">{item.label}</span>
              </Link>
            );
          })}
          {hasMore ? (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium text-muted-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Plus</span>
            </button>
          ) : (
            <div />
          )}
        </nav>

        <footer className="hidden border-t border-border bg-gradient-to-r from-primary via-primary-strong to-[#7A2A08] px-4 py-3 text-white lg:block lg:px-6">
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-1">
                <Image
                  src="/palm-logo.png"
                  alt="Palm Corporation"
                  width={24}
                  height={24}
                  className="object-contain"
                />
              </div>
              <p className="text-xs font-medium leading-tight">
                Tout droit réservé Palm Corporation - Artificial Intelligence &amp; Technology
              </p>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-orange-100">
              WhatsApp : +226 77419106 / +226 73630882 / +226 68538246
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
