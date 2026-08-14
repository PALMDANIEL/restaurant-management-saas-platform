"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { Wallet, Lock, Unlock } from "lucide-react";

type CashSession = {
  id: number;
  venueId: number;
  status: "open" | "closed";
  openedAt: string;
  openingAmount: number;
  closedAt: string | null;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  notes: string | null;
};

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

export default function CashRegisterPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["cash-sessions", venueParam],
    queryFn: async () => (await fetch(`/api/cash-sessions?venueId=${venueParam}`)).json(),
    refetchInterval: 15000,
  });
  const sessions: CashSession[] = useMemo(() => data?.sessions ?? [], [data]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.venueId === targetVenueId && s.status === "open"),
    [sessions, targetVenueId]
  );
  const history = useMemo(
    () => sessions.filter((s) => s.status === "closed"),
    [sessions]
  );

  const openSession = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/cash-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Session de caisse ouverte");
      queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
      setShowOpenForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeSession = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/cash-sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Session de caisse clôturée");
      queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
      setShowCloseForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Caisse</h1>
          <p className="text-sm text-muted-foreground">
            Ouvrez et clôturez vos sessions de caisse, suivez les écarts.
          </p>
        </div>
        {can(user?.role, "manageCashRegister") &&
          (currentSession ? (
            <Button variant="destructive" onClick={() => setShowCloseForm(true)}>
              <Lock className="h-4 w-4" /> Clôturer la caisse
            </Button>
          ) : (
            <Button onClick={() => setShowOpenForm(true)}>
              <Unlock className="h-4 w-4" /> Ouvrir la caisse
            </Button>
          ))}
      </div>

      <Card className={cn(currentSession ? "border-emerald-300" : "border-amber-300")}>
        <CardContent className="flex items-center gap-4 p-5">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              currentSession ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            )}
          >
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            {currentSession ? (
              <>
                <p className="font-semibold">Caisse ouverte</p>
                <p className="text-sm text-muted-foreground">
                  Fond de départ : {formatFcfa(currentSession.openingAmount)} · Ouverte le{" "}
                  {formatDate(currentSession.openedAt, true)}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Aucune caisse ouverte</p>
                <p className="text-sm text-muted-foreground">
                  Ouvre une session de caisse avant de pouvoir encaisser des ventes.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique des sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Ouverture</th>
                  <th className="pb-2">Clôture</th>
                  <th className="pb-2">Fond initial</th>
                  <th className="pb-2">Attendu</th>
                  <th className="pb-2">Compté</th>
                  <th className="pb-2">Écart</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="py-2">{formatDate(s.openedAt, true)}</td>
                    <td className="py-2">{s.closedAt ? formatDate(s.closedAt, true) : "—"}</td>
                    <td className="py-2">{formatFcfa(s.openingAmount)}</td>
                    <td className="py-2">{s.expectedAmount !== null ? formatFcfa(s.expectedAmount) : "—"}</td>
                    <td className="py-2">{s.closingAmount !== null ? formatFcfa(s.closingAmount) : "—"}</td>
                    <td className="py-2">
                      {s.difference !== null && (
                        <Badge
                          className={
                            s.difference === 0
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : s.difference > 0
                              ? "border-sky-300 bg-sky-50 text-sky-700"
                              : "border-red-300 bg-red-50 text-red-700"
                          }
                        >
                          {s.difference > 0 ? "+" : ""}
                          {formatFcfa(s.difference)}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isLoading && history.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune session clôturée pour l&apos;instant.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {showOpenForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Ouvrir la caisse</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                openSession.mutate({
                  venueId: targetVenueId,
                  openingAmount: Number(form.get("openingAmount") || 0),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Fond de caisse de départ (FCFA)</Label>
                <Input name="openingAmount" type="number" min={0} defaultValue={0} required />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setShowOpenForm(false)}>
                  Annuler
                </Button>
                <Button type="submit" className="w-full" loading={openSession.isPending}>
                  Ouvrir
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCloseForm && currentSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Clôturer la caisse</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                closeSession.mutate({
                  id: currentSession.id,
                  closingAmount: Number(form.get("closingAmount")),
                  notes: String(form.get("notes") || "") || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Montant compté en caisse (FCFA)</Label>
                <Input name="closingAmount" type="number" min={0} required />
              </div>
              <div>
                <Label>Notes (optionnel)</Label>
                <Textarea name="notes" placeholder="Ex: écart justifié par..." />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setShowCloseForm(false)}>
                  Annuler
                </Button>
                <Button type="submit" variant="destructive" className="w-full" loading={closeSession.isPending}>
                  Clôturer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
