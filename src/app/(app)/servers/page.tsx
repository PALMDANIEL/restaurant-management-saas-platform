"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { initials } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { UserPlus, X, CheckCircle2, XCircle, Timer, Gauge } from "lucide-react";

type StaffUser = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  active: boolean;
  matricule: string | null;
};
type Perf = {
  id: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgServiceMinutes: number | null;
  score: number | null;
};

function scoreLabel(score: number | null) {
  if (score === null) return { label: "Pas assez de données", className: "border-slate-300 bg-slate-50 text-slate-600" };
  if (score >= 80) return { label: "Excellent", className: "border-emerald-300 bg-emerald-50 text-emerald-700" };
  if (score >= 60) return { label: "Bon", className: "border-sky-300 bg-sky-50 text-sky-700" };
  if (score >= 40) return { label: "Moyen", className: "border-amber-300 bg-amber-50 text-amber-700" };
  return { label: "À améliorer", className: "border-red-300 bg-red-50 text-red-700" };
}

export default function ServersPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["users", "serveuse"],
    queryFn: async () => (await fetch(`/api/users?role=serveuse`)).json(),
  });
  const servers: StaffUser[] = data?.users ?? [];

  const { data: perfData } = useQuery({
    queryKey: ["server-performance", venueParam],
    queryFn: async () => (await fetch(`/api/servers/performance?venueId=${venueParam}`)).json(),
  });
  const perfById = new Map<number, Perf>((perfData?.performance ?? []).map((p: Perf) => [p.id, p]));

  const ranked = [...servers].sort((a, b) => {
    const scoreA = perfById.get(a.id)?.score ?? -1;
    const scoreB = perfById.get(b.id)?.score ?? -1;
    return scoreB - scoreA;
  });

  const createServer = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Serveuse ajoutée");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Serveuses</h1>
          <p className="text-sm text-muted-foreground">
            Score automatique du mois — calculé uniquement à partir de l&apos;exécution des commandes (taux de commandes
            servies, rapidité, annulations). Aucune note manuelle.
          </p>
        </div>
        {can(user?.role, "manageServers") && (
          <Button onClick={() => setShowForm(true)}>
            <UserPlus className="h-4 w-4" /> Ajouter
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ranked.map((s) => {
          const perf = perfById.get(s.id);
          const sc = scoreLabel(perf?.score ?? null);
          return (
            <Card key={s.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {initials(s.firstName, s.lastName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.phone || s.matricule || "—"}</p>
                  </div>
                  <Badge className={s.active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}>
                    {s.active ? "Actif" : "Inactif"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Score du mois</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {perf?.score !== null && perf?.score !== undefined && (
                      <span className="text-lg font-bold">{perf.score}/100</span>
                    )}
                    <Badge className={sc.className}>{sc.label}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-600" />
                    <p className="mt-1 text-sm font-semibold">{perf?.completedOrders ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Servies</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <XCircle className="mx-auto h-3.5 w-3.5 text-red-500" />
                    <p className="mt-1 text-sm font-semibold">{perf?.cancelledOrders ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Annulées</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <Timer className="mx-auto h-3.5 w-3.5 text-sky-600" />
                    <p className="mt-1 text-sm font-semibold">
                      {perf?.avgServiceMinutes !== null && perf?.avgServiceMinutes !== undefined ? `${perf.avgServiceMinutes} min` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Temps moyen</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && servers.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Aucune serveuse enregistrée.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvelle serveuse</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createServer.mutate({
                  email: String(form.get("email")),
                  password: String(form.get("password")),
                  role: "serveuse",
                  firstName: String(form.get("firstName")),
                  lastName: String(form.get("lastName")),
                  phone: String(form.get("phone") || "") || undefined,
                  venueIds: venues.length ? [venues[0].id] : [],
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prénom</Label>
                  <Input name="firstName" required />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input name="lastName" required />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" required />
              </div>
              <div>
                <Label>Mot de passe</Label>
                <Input name="password" type="password" minLength={6} required />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input name="phone" />
              </div>
              <Button type="submit" className="w-full" loading={createServer.isPending}>
                Ajouter
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


