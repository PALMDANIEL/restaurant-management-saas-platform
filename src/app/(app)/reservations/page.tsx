"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { CalendarClock, Plus, X, Users } from "lucide-react";

type Reservation = {
  id: number;
  customerName: string;
  phone: string | null;
  partySize: number;
  reservationTime: string;
  status: "pending" | "confirmed" | "seated" | "cancelled" | "completed";
  tableNumber: string | null;
  notes: string | null;
};
type Table = { id: number; number: string; capacity: number };

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  seated: "Installée",
  cancelled: "Annulée",
  completed: "Terminée",
};
const STATUS_CLASSES: Record<string, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-700",
  confirmed: "border-sky-300 bg-sky-50 text-sky-700",
  seated: "border-emerald-300 bg-emerald-50 text-emerald-700",
  cancelled: "border-red-300 bg-red-50 text-red-700",
  completed: "border-slate-300 bg-slate-50 text-slate-700",
};
const NEXT_STATUS: Partial<Record<Reservation["status"], Reservation["status"]>> = {
  pending: "confirmed",
  confirmed: "seated",
  seated: "completed",
};

export default function ReservationsPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("upcoming");

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["reservations", venueParam],
    queryFn: async () => (await fetch(`/api/reservations?venueId=${venueParam}`)).json(),
    refetchInterval: 30000,
  });
  const { data: tablesData } = useQuery({
    queryKey: ["tables", venueParam],
    queryFn: async () => (await fetch(`/api/tables?venueId=${venueParam}`)).json(),
  });

  const reservations: Reservation[] = useMemo(() => data?.reservations ?? [], [data]);
  const tables: Table[] = tablesData?.tables ?? [];

  const filtered = useMemo(() => {
    if (statusFilter === "upcoming")
      return reservations.filter((r) => r.status === "pending" || r.status === "confirmed" || r.status === "seated");
    if (statusFilter === "all") return reservations;
    return reservations.filter((r) => r.status === statusFilter);
  }, [reservations, statusFilter]);

  const createReservation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Réservation créée");
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateReservation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Réservation mise à jour");
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Réservations</h1>
          <p className="text-sm text-muted-foreground">Gérez les réservations de tables.</p>
        </div>
        <div className="flex gap-2">
          <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="upcoming">À venir</option>
            <option value="all">Toutes</option>
            <option value="pending">En attente</option>
            <option value="confirmed">Confirmées</option>
            <option value="seated">Installées</option>
            <option value="completed">Terminées</option>
            <option value="cancelled">Annulées</option>
          </Select>
          {can(user?.role, "manageReservations") && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" /> Réservation
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.customerName}</span>
                <Badge className={STATUS_CLASSES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> {r.partySize} pers. {r.tableNumber ? `· Table ${r.tableNumber}` : ""}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> {formatDate(r.reservationTime, true)}
              </div>
              {r.phone && <p className="text-xs text-muted-foreground">{r.phone}</p>}
              {r.notes && <p className="text-xs italic text-muted-foreground">{r.notes}</p>}
              {can(user?.role, "manageReservations") && r.status !== "cancelled" && r.status !== "completed" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {NEXT_STATUS[r.status] && (
                    <Button size="sm" variant="outline" onClick={() => updateReservation.mutate({ id: r.id, status: NEXT_STATUS[r.status] })}>
                      Marquer &quot;{STATUS_LABELS[NEXT_STATUS[r.status]!]}&quot;
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => updateReservation.mutate({ id: r.id, status: "cancelled" })}
                  >
                    Annuler
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Aucune réservation dans cette vue.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvelle réservation</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createReservation.mutate({
                  venueId: targetVenueId,
                  customerName: String(form.get("customerName")),
                  phone: String(form.get("phone") || "") || undefined,
                  partySize: Number(form.get("partySize") || 2),
                  reservationTime: new Date(String(form.get("reservationTime"))).toISOString(),
                  tableId: form.get("tableId") ? Number(form.get("tableId")) : undefined,
                  notes: String(form.get("notes") || "") || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Nom du client</Label>
                <Input name="customerName" required />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input name="phone" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nombre de personnes</Label>
                  <Input name="partySize" type="number" min={1} defaultValue={2} required />
                </div>
                <div>
                  <Label>Date & heure</Label>
                  <Input name="reservationTime" type="datetime-local" required />
                </div>
              </div>
              <div>
                <Label>Table (optionnel)</Label>
                <Select name="tableId">
                  <option value="">Non assignée</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.number} ({t.capacity} pers.)
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input name="notes" placeholder="Ex: anniversaire, allergie..." />
              </div>
              <Button type="submit" className="w-full" loading={createReservation.isPending}>
                Créer la réservation
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
