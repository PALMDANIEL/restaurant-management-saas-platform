"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { formatMoney, ORDER_STATUS_LABELS } from "@/lib/utils";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  CalendarDays,
  Trophy,
  PackageX,
  Users,
  ShoppingCart,
  UtensilsCrossed,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";

const STATUS_COLORS: Record<string, string> = {
  new: "#2563EB",
  preparing: "#B9790F",
  served: "#146356",
  paid: "#16A34A",
  cancelled: "#DC2626",
};

type PeriodStat = { revenue: number; ordersCount: number; profit: number };
type DashboardData = {
  today: PeriodStat;
  week: PeriodStat;
  month: PeriodStat;
  year: PeriodStat;
  topProducts: { name: string; quantity: number; revenue: number }[];
  topServers: { id: number; name: string; sales: number; revenue: number }[];
  lowStock: { id: number; name: string; stockQuantity: string; stockAlertThreshold: string }[];
  outOfStock: { id: number; name: string }[];
  evolution: { date: string; revenue: number }[];
  statusCounts: { status: string; count: number }[];
  topCustomers: { id: number; name: string; totalSpent: number }[];
};

function SectionHeading({
  icon: Icon,
  tone = "text-foreground/70",
  children,
}: {
  icon: typeof Trophy;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <CardTitle className="flex items-center gap-1.5">
      <Icon className={`h-4 w-4 ${tone}`} /> {children}
    </CardTitle>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const monthNames = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function todayFr() {
  const d = new Date();
  return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;
}

export default function DashboardPage() {
  const venueId = useVenueParam();
  const user = useAppStore((s) => s.user);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", venueId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?venueId=${venueId}`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-sidebar px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="weave-texture pointer-events-none absolute inset-0 opacity-40" />
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-white/50">
              <CalendarDays className="h-3.5 w-3.5" /> {todayFr()}
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting}{user?.firstName ? `, ${user.firstName}` : ""} <span className="align-middle">👋</span>
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-white/60">
              Voici la performance de votre activité en temps réel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pos">
              <Button className="bg-white text-sidebar hover:bg-white/90 shadow-lg shadow-black/20" size="lg">
                <ShoppingCart className="h-4 w-4" /> Nouvelle vente
              </Button>
            </Link>
            <Link href="/orders">
              <Button
                variant="outline"
                size="lg"
                className="border-white/25 bg-white/5 text-white hover:bg-white/15"
              >
                <UtensilsCrossed className="h-4 w-4" /> Commandes
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Ventes aujourd'hui"
          value={formatMoney(data?.today.revenue ?? 0)}
          sub={`${data?.today.ordersCount ?? 0} commande${(data?.today.ordersCount ?? 0) > 1 ? "s" : ""}`}
          icon={Wallet}
          tone="primary"
        />
        <StatCard
          label="Cette semaine"
          value={formatMoney(data?.week.revenue ?? 0)}
          sub={`${data?.week.ordersCount ?? 0} commandes`}
          icon={TrendingUp}
          tone="accent"
        />
        <StatCard
          label="Ce mois"
          value={formatMoney(data?.month.revenue ?? 0)}
          sub={`Bénéfice ${formatMoney(data?.month.profit ?? 0)}`}
          icon={Sparkles}
          tone="sun"
        />
        <StatCard
          label="Cette année"
          value={formatMoney(data?.year.revenue ?? 0)}
          sub={`Bénéfice ${formatMoney(data?.year.profit ?? 0)}`}
          icon={Trophy}
          tone="neutral"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <SectionHeading icon={TrendingUp} tone="text-primary">
              Évolution des ventes
            </SectionHeading>
            <span className="text-xs text-muted-foreground">30 derniers jours</span>
          </CardHeader>
          <CardContent className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.evolution ?? []} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(d) => d.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={0}
                />
                <Tooltip
                  formatter={(v) => formatMoney(Number(v ?? 0))}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 13,
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="var(--primary)" fill="url(#rev)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading icon={UtensilsCrossed}>Statuts des commandes</SectionHeading>
            <p className="mt-0.5 text-xs text-muted-foreground">30 derniers jours</p>
          </CardHeader>
          <CardContent className="h-64 sm:h-72">
            {(data?.statusCounts ?? []).length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <EmptyRow>Aucune commande sur la période.</EmptyRow>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.statusCounts ?? []}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={4}
                    strokeWidth={0}
                  >
                    {(data?.statusCounts ?? []).map((s, i) => (
                      <Cell key={i} fill={STATUS_COLORS[s.status] ?? "var(--primary)"} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [String(v), ORDER_STATUS_LABELS[String(n)] ?? String(n)]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      fontSize: 13,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionHeading icon={Trophy} tone="text-sun">Top produits</SectionHeading>
            <p className="mt-0.5 text-xs text-muted-foreground">30 derniers jours</p>
          </CardHeader>
          <CardContent className="h-56">
            {(data?.topProducts ?? []).length === 0 ? (
              <EmptyRow>Pas encore de ventes.</EmptyRow>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.topProducts ?? []} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => formatMoney(Number(v ?? 0))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading icon={Users} tone="text-accent">Top serveuses</SectionHeading>
            <p className="mt-0.5 text-xs text-muted-foreground">Ce mois-ci</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.topServers ?? []).length === 0 && <EmptyRow>Aucune donnée pour l&apos;instant.</EmptyRow>}
            {(data?.topServers ?? []).map((s, i) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-border p-2.5 transition-colors hover:bg-muted/60"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      i === 0
                        ? "bg-sun-soft text-sun"
                        : "bg-primary/10 text-primary-strong"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold tabular-nums">{formatMoney(s.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{s.sales} ventes</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading icon={PackageX} tone="text-red-500">Alertes stock</SectionHeading>
            <p className="mt-0.5 text-xs text-muted-foreground">Seuil atteint ou dépassé</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.lowStock ?? []).length === 0 && (
              <EmptyRow>Tout va bien, aucune alerte 🌿</EmptyRow>
            )}
            {(data?.lowStock ?? []).map((p) => {
              const outOfStock = Number(p.stockQuantity) <= 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl border p-2.5 ${
                    outOfStock ? "border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20" : "border-border"
                  }`}
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span
                    className={`text-xs font-semibold ${
                      outOfStock ? "text-red-600" : "text-sun"
                    }`}
                  >
                    {outOfStock ? "Rupture" : `${p.stockQuantity} restant(s)`}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <SectionHeading icon={Users}>Top clients fidèles</SectionHeading>
          <Link href="/customers" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {(data?.topCustomers ?? []).length === 0 ? (
            <EmptyRow>Aucun client enregistré pour le moment.</EmptyRow>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {(data?.topCustomers ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border p-3 transition-colors hover:bg-muted/60"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">{formatMoney(c.totalSpent)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-muted/50" />
          ))}
        </div>
      )}
    </div>
  );
}
