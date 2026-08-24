"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { Receipt, Plus, Trash2, X } from "lucide-react";

type Expense = {
  id: number;
  venueId: number;
  category: string;
  label: string;
  amount: number;
  expenseDate: string;
  createdAt: string;
};

const FALLBACK_CATEGORIES = ["Loyer", "Salaires", "Électricité / Eau", "Approvisionnement", "Maintenance", "Transport", "Marketing", "Autre"];

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default function ExpensesPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", venueParam],
    queryFn: async () => (await fetch(`/api/expenses?venueId=${venueParam}`)).json(),
  });
  const expenses: Expense[] = useMemo(() => data?.expenses ?? [], [data]);

  const { data: catData } = useQuery({
    queryKey: ["expense-categories", venueParam],
    queryFn: async () => (await fetch(`/api/expense-categories?venueId=${venueParam}`)).json(),
  });
  const categoryNames: string[] = useMemo(() => {
    const names = (catData?.categories ?? []).map((c: { name: string }) => c.name);
    return names.length > 0 ? names : FALLBACK_CATEGORIES;
  }, [catData]);

  const filtered = useMemo(
    () => (categoryFilter === "all" ? expenses : expenses.filter((e) => e.category === categoryFilter)),
    [expenses, categoryFilter]
  );

  const total = filtered.reduce((sum, e) => sum + e.amount, 0);
  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = new Date(e.expenseDate);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const createExpense = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Dépense enregistrée");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Dépense supprimée");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dépenses</h1>
          <p className="text-sm text-muted-foreground">Suivez vos charges et dépenses courantes.</p>
        </div>
        {can(user?.role, "manageExpenses") && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Nouvelle dépense
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <Receipt className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Dépenses ce mois-ci</p>
              <p className="text-xl font-bold">{formatFcfa(monthTotal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Répartition par catégorie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {byCategory.slice(0, 4).map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{cat}</span>
                <span className="font-medium">{formatFcfa(amt)}</span>
              </div>
            ))}
            {byCategory.length === 0 && <p className="text-sm text-muted-foreground">Aucune dépense enregistrée.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Historique ({filtered.length}) — {formatFcfa(total)}</CardTitle>
          <Select className="w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Toutes les catégories</option>
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Catégorie</th>
                  <th className="pb-2">Libellé</th>
                  <th className="pb-2">Montant</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="py-2.5">{formatDate(e.expenseDate)}</td>
                    <td className="py-2.5">
                      <Badge className="border-border bg-muted text-foreground">{e.category}</Badge>
                    </td>
                    <td className="py-2.5 font-medium">{e.label}</td>
                    <td className="py-2.5 font-semibold text-red-600">-{formatFcfa(e.amount)}</td>
                    <td className="py-2.5 text-right">
                      {can(user?.role, "manageExpenses") && (
                        <button onClick={() => deleteExpense.mutate(e.id)} className="text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isLoading && filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune dépense trouvée.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvelle dépense</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createExpense.mutate({
                  venueId: targetVenueId,
                  category: String(form.get("category")),
                  label: String(form.get("label")),
                  amount: Number(form.get("amount")),
                  expenseDate: String(form.get("expenseDate")),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Catégorie</Label>
                <Select name="category" required>
                  {categoryNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Libellé</Label>
                <Input name="label" placeholder="Ex: Facture SONABEL juillet" required />
              </div>
              <div>
                <Label>Montant (FCFA)</Label>
                <Input name="amount" type="number" min={1} required />
              </div>
              <div>
                <Label>Date</Label>
                <Input name="expenseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <Button type="submit" className="w-full" loading={createExpense.isPending}>
                Enregistrer
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
