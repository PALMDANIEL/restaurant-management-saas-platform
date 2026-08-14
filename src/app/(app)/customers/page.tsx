"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { UserPlus, Search, Star, Gift, History, X, Minus, Plus } from "lucide-react";

type Customer = {
  id: number;
  venueId: number;
  name: string;
  phone: string | null;
  loyaltyPoints: number;
  totalSpent: number;
  createdAt: string;
};

type LoyaltyTxn = {
  id: number;
  type: "earn" | "redeem" | "adjustment";
  points: number;
  note: string | null;
  createdAt: string;
};

const TIERS = [
  { key: "bronze", label: "Bronze", min: 0, className: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30" },
  { key: "argent", label: "Argent", min: 100_000, className: "border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-800/40" },
  { key: "or", label: "Or", min: 500_000, className: "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30" },
] as const;

function tierFor(totalSpent: number) {
  return [...TIERS].reverse().find((t) => totalSpent >= t.min) ?? TIERS[0];
}

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

const FCFA_PER_POINT_LABEL = "1 point / 500 FCFA dépensés";

export default function CustomersPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [pointsCustomer, setPointsCustomer] = useState<Customer | null>(null);
  const [pointsAction, setPointsAction] = useState<"earn" | "redeem">("earn");
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["customers", venueParam],
    queryFn: async () => (await fetch(`/api/customers?venueId=${venueParam}`)).json(),
  });
  const customers: Customer[] = useMemo(() => data?.customers ?? [], [data]);

  const { data: historyData } = useQuery({
    queryKey: ["loyalty", historyCustomer?.id],
    queryFn: async () => (await fetch(`/api/loyalty?customerId=${historyCustomer!.id}`)).json(),
    enabled: !!historyCustomer,
  });
  const history: LoyaltyTxn[] = historyData?.transactions ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  const createCustomer = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Client créé");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowCreateForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitPoints = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success(pointsAction === "earn" ? "Points attribués" : "Points utilisés");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty"] });
      setPointsCustomer(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients & Fidélité</h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos clients et leur programme de fidélité ({FCFA_PER_POINT_LABEL}).
          </p>
        </div>
        {can(user?.role, "manageCustomers") && (
          <Button onClick={() => setShowCreateForm(true)}>
            <UserPlus className="h-4 w-4" /> Nouveau client
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher un client (nom, téléphone)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des clients ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Client</th>
                  <th className="pb-2">Téléphone</th>
                  <th className="pb-2">Palier</th>
                  <th className="pb-2">Points</th>
                  <th className="pb-2">Total dépensé</th>
                  <th className="pb-2">Depuis</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const tier = tierFor(c.totalSpent);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 font-medium">{c.name}</td>
                      <td className="py-2.5 text-muted-foreground">{c.phone || "—"}</td>
                      <td className="py-2.5">
                        <Badge className={tier.className}>
                          <Star className="h-3 w-3" /> {tier.label}
                        </Badge>
                      </td>
                      <td className="py-2.5 font-semibold">{c.loyaltyPoints} pts</td>
                      <td className="py-2.5">{formatFcfa(c.totalSpent)}</td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(c.createdAt)}</td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {can(user?.role, "manageCustomers") && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPointsAction("earn");
                                  setPointsCustomer(c);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" /> Points
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={c.loyaltyPoints <= 0}
                                onClick={() => {
                                  setPointsAction("redeem");
                                  setPointsCustomer(c);
                                }}
                              >
                                <Gift className="h-3.5 w-3.5" /> Utiliser
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setHistoryCustomer(c)}>
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!isLoading && filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun client trouvé.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create customer modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouveau client</h3>
              <button onClick={() => setShowCreateForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createCustomer.mutate({
                  venueId: targetVenueId,
                  name: String(form.get("name")),
                  phone: String(form.get("phone") || "") || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Nom complet</Label>
                <Input name="name" required />
              </div>
              <div>
                <Label>Téléphone (optionnel)</Label>
                <Input name="phone" placeholder="+226 ..." />
              </div>
              <Button type="submit" className="w-full" loading={createCustomer.isPending}>
                Créer le client
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Earn / redeem points modal */}
      {pointsCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {pointsAction === "earn" ? "Attribuer des points" : "Utiliser des points"} — {pointsCustomer.name}
              </h3>
              <button onClick={() => setPointsCustomer(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Solde actuel : <span className="font-semibold text-foreground">{pointsCustomer.loyaltyPoints} pts</span>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                if (pointsAction === "earn") {
                  const amountSpent = Number(form.get("amountSpent") || 0);
                  const manualPoints = form.get("manualPoints") ? Number(form.get("manualPoints")) : undefined;
                  submitPoints.mutate({
                    customerId: pointsCustomer.id,
                    type: "earn",
                    amountSpent: amountSpent || undefined,
                    points: manualPoints,
                    note: String(form.get("note") || "") || undefined,
                  });
                } else {
                  submitPoints.mutate({
                    customerId: pointsCustomer.id,
                    type: "redeem",
                    points: Number(form.get("points")),
                    note: String(form.get("note") || "") || undefined,
                  });
                }
              }}
              className="space-y-3"
            >
              {pointsAction === "earn" ? (
                <>
                  <div>
                    <Label>Montant dépensé (FCFA) — {FCFA_PER_POINT_LABEL}</Label>
                    <Input name="amountSpent" type="number" min={0} placeholder="Ex: 5000" />
                  </div>
                  <div>
                    <Label>Ou points manuels (remplace le calcul automatique)</Label>
                    <Input name="manualPoints" type="number" min={1} placeholder="Ex: 10" />
                  </div>
                </>
              ) : (
                <div>
                  <Label>Points à utiliser</Label>
                  <Input name="points" type="number" min={1} max={pointsCustomer.loyaltyPoints} required />
                </div>
              )}
              <div>
                <Label>Note (optionnel)</Label>
                <Textarea name="note" placeholder="Ex: Récompense fidélité, réduction offerte..." />
              </div>
              <Button type="submit" className="w-full" loading={submitPoints.isPending}>
                Confirmer
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* History drawer */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Historique — {historyCustomer.name}</h3>
              <button onClick={() => setHistoryCustomer(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {history.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                  {t.points >= 0 ? (
                    <Plus className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Minus className="h-4 w-4 shrink-0 text-red-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", t.points >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {t.points >= 0 ? "+" : ""}
                      {t.points} pts
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.note || (t.type === "earn" ? "Points gagnés" : t.type === "redeem" ? "Points utilisés" : "Ajustement")} ·{" "}
                      {formatDate(t.createdAt, true)}
                    </p>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune transaction de fidélité.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
