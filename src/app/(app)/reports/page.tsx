"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatDate } from "@/lib/utils";
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
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, Scale } from "lucide-react";

type DashboardData = {
  month: { revenue: number; ordersCount: number; profit: number };
  year: { revenue: number; ordersCount: number; profit: number };
  evolution: { date: string; revenue: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
};
type Expense = { id: number; category: string; amount: number; expenseDate: string };

const COLORS = ["#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5"];

export default function ReportsPage() {
  const venueParam = useVenueParam();

  const { data: dash } = useQuery<DashboardData>({
    queryKey: ["dashboard", venueParam],
    queryFn: async () => (await fetch(`/api/dashboard?venueId=${venueParam}`)).json(),
  });
  const { data: expData } = useQuery({
    queryKey: ["expenses", venueParam],
    queryFn: async () => (await fetch(`/api/expenses?venueId=${venueParam}`)).json(),
  });

  const expenses: Expense[] = useMemo(() => expData?.expenses ?? [], [expData]);

  const monthExpenses = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = new Date(e.expenseDate);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const monthRevenue = dash?.month.revenue ?? 0;
  const monthGrossProfit = dash?.month.profit ?? 0;
  const netResult = monthGrossProfit - monthExpenses;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapports & Finances</h1>
        <p className="text-sm text-muted-foreground">Vue d&apos;ensemble financière du mois en cours.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Chiffre d&apos;affaires (mois)</p>
              <p className="text-lg font-bold">{formatMoney(monthRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Marge brute (mois)</p>
              <p className="text-lg font-bold">{formatMoney(monthGrossProfit)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dépenses (mois)</p>
              <p className="text-lg font-bold">{formatMoney(monthExpenses)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={netResult >= 0 ? "border-emerald-300" : "border-red-300"}>
          <CardContent className="flex items-center gap-3 p-5">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                netResult >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Résultat net (mois)</p>
              <p className="text-lg font-bold">{formatMoney(netResult)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Évolution du chiffre d&apos;affaires (30j)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dash?.evolution ?? []}>
                <defs>
                  <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ea580c" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => formatDate(d)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v ?? 0))} labelFormatter={(d) => formatDate(String(d))} />
                <Area type="monotone" dataKey="revenue" stroke="#ea580c" fill="url(#revGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition des dépenses</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {expensesByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {expensesByCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(Number(v ?? 0))} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucune dépense enregistrée.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top produits (30 jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Produit</th>
                  <th className="pb-2">Quantité vendue</th>
                  <th className="pb-2">Chiffre d&apos;affaires</th>
                </tr>
              </thead>
              <tbody>
                {(dash?.topProducts ?? []).map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-muted-foreground">{p.quantity}</td>
                    <td className="py-2 font-semibold">{formatMoney(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(dash?.topProducts ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Pas encore de données de vente.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
