"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { Ticket, Plus, X, Ban, CheckCircle2, Clock3 } from "lucide-react";

type CreditNote = {
  id: number;
  venueId: number;
  code: string;
  amount: number;
  remainingAmount: number;
  reason: string | null;
  status: "active" | "used" | "cancelled";
  customerName: string | null;
  issuedByName: string | null;
  createdAt: string;
  usedAt: string | null;
};

type Customer = { id: number; name: string; phone: string | null };

function formatFcfa(n: number) {
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

const STATUS_CONFIG: Record<CreditNote["status"], { label: string; className: string; icon: typeof Clock3 }> = {
  active: { label: "Actif", className: "border-accent/30 bg-accent/10 text-accent", icon: Clock3 },
  used: { label: "Utilisé", className: "border-emerald-300 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "Annulé", className: "border-red-300 bg-red-50 text-red-700", icon: Ban },
};

export default function CreditNotesPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["credit-notes", venueParam, statusFilter],
    queryFn: async () =>
      (
        await fetch(`/api/credit-notes?venueId=${venueParam}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`)
      ).json(),
  });
  const { data: customersData } = useQuery({
    queryKey: ["customers", venueParam],
    queryFn: async () => (await fetch(`/api/customers?venueId=${venueParam}`)).json(),
  });

  const customers: Customer[] = customersData?.customers ?? [];

  const filtered = useMemo(() => {
    const notes: CreditNote[] = data?.creditNotes ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.code.toLowerCase().includes(q) || (n.customerName ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const createNote = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/credit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Avoir ${data.creditNote.code} émis`);
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      setShowCreateForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelNote = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/credit-notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "cancelled" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Avoir annulé");
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Caisse"
        title="Avoirs"
        description="Avoirs émis (souvent suite à un manque de monnaie) et utilisables lors d'un prochain passage."
        actions={
          can(user?.role, "manageCreditNotes") && (
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4" /> Émettre un avoir
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Rechercher un code ou un client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="used">Utilisés</option>
          <option value="cancelled">Annulés</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((n) => {
          const cfg = STATUS_CONFIG[n.status];
          const Icon = cfg.icon;
          return (
            <Card key={n.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold tracking-wide">{n.code}</span>
                  <Badge className={cfg.className}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </Badge>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Restant</span>
                  <span className="font-mono text-lg font-bold tabular-nums text-primary-strong">
                    {formatFcfa(n.remainingAmount)}
                  </span>
                </div>
                {n.remainingAmount !== n.amount && (
                  <p className="text-right text-xs text-muted-foreground">
                    sur {formatFcfa(n.amount)} initial
                  </p>
                )}
                {n.customerName && <p className="text-sm">Client : {n.customerName}</p>}
                {n.reason && <p className="text-xs text-muted-foreground italic">{n.reason}</p>}
                <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>{n.issuedByName ?? "—"}</span>
                  <span>{formatDate(n.createdAt, true)}</span>
                </div>
                {n.status === "active" && can(user?.role, "manageCreditNotes") && (
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancelNote.mutate(n.id)}>
                      Annuler l&apos;avoir
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border py-14 text-center">
            <Ticket className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">Aucun avoir dans cette vue.</p>
          </div>
        )}
      </div>

      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl bg-card p-6 shadow-xl pb-safe sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Émettre un avoir</h3>
              <button onClick={() => setShowCreateForm(false)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createNote.mutate({
                  venueId: targetVenueId,
                  customerId: form.get("customerId") ? Number(form.get("customerId")) : null,
                  amount: Number(form.get("amount")),
                  reason: String(form.get("reason") || ""),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Client (optionnel)</Label>
                <Select name="customerId">
                  <option value="">Avoir anonyme (au porteur du code)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Montant (FCFA)</Label>
                <Input name="amount" type="number" min={1} required />
              </div>
              <div>
                <Label>Motif</Label>
                <Textarea name="reason" placeholder="Ex : retour produit, geste commercial..." required />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setShowCreateForm(false)}>
                  Annuler
                </Button>
                <Button type="submit" className="w-full" loading={createNote.isPending}>
                  Émettre
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
