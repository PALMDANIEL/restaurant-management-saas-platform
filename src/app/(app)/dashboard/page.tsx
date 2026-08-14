"use client";

import { useQuery } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { TrendingUp, ShoppingBag, Wallet, PackageX, Star, Users } from "lucide-react";
import { useAppStore } from "@/store/app-store";

const COLORS = ["#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa"];
const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6",
  preparing: "#f59e0b",
  served: "#a855f7",
  paid: "#22c55e",
  cancelled: "#ef4444",
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

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: typeof TrendingUp;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Bonjour {user?.firstName ?? ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici la performance de votre activité en temps réel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Ventes aujourd'hui"
          value={formatMoney(data?.today.revenue ?? 0)}
          sub={`${data?.today.ordersCount ?? 0} commandes`}
          icon={Wallet}
        />
        <KpiCard
          title="Cette semaine"
          value={formatMoney(data?.week.revenue ?? 0)}
          sub={`${data?.week.ordersCount ?? 0} commandes`}
          icon={TrendingUp}
        />
        <KpiCard
          title="Ce mois"
          value={formatMoney(data?.month.revenue ?? 0)}
          sub={`Bénéfice brut ${formatMoney(data?.month.profit ?? 0)}`}
          icon={ShoppingBag}
        />
        <KpiCard
          title="Cette année"
          value={formatMoney(data?.year.revenue ?? 0)}
          sub={`Bénéfice brut ${formatMoney(data?.year.profit ?? 0)}`}
          icon={Star}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Évolution des ventes (30 derniers jours)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.evolution ?? []}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v ?? 0))} />
                <Area type="monotone" dataKey="revenue" stroke="#ea580c" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statuts des commandes (30j)</CardTitle>
          </CardHeader>
          <CardContent className="h-72 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.statusCounts ?? []}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {(data?.statusCounts ?? []).map((s, i) => (
                    <Cell key={i} fill={STATUS_COLORS[s.status] ?? COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [String(v), ORDER_STATUS_LABELS[String(n)] ?? String(n)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top produits (30j)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.topProducts ?? []} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v) => formatMoney(Number(v ?? 0))} />
                <Bar dataKey="revenue" fill="#ea580c" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top serveuses (ce mois)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.topServers ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune donnée</p>
            )}
            {(data?.topServers ?? []).map((s, i) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(s.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{s.sales} ventes</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <PackageX className="h-4 w-4 text-red-500" /> Alertes stock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.lowStock ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Tout va bien, aucune alerte.</p>
            )}
            {(data?.lowStock ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <span className="text-sm font-medium">{p.name}</span>
                <span
                  className={`text-xs font-semibold ${
                    Number(p.stockQuantity) <= 0 ? "text-red-600" : "text-amber-600"
                  }`}
                >
                  {Number(p.stockQuantity) <= 0 ? "Rupture" : `${p.stockQuantity} restant(s)`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Top clients fidèles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(data?.topCustomers ?? []).map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{formatMoney(c.totalSpent)}</p>
              </div>
            ))}
            {(data?.topCustomers ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun client enregistré.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement des données...</p>}
    </div>
  );
}
