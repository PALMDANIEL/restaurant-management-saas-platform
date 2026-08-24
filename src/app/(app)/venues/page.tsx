"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { Landmark, Plus, X } from "lucide-react";

type Venue = {
  id: number;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  qrOrderingEnabled: boolean;
};

const TYPE_LABELS: Record<string, string> = { maquis: "Maquis", restaurant: "Restaurant", bar: "Bar", fastfood: "Fast-food" };

export default function VenuesPage() {
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["venues-admin"],
    queryFn: async () => (await fetch(`/api/venues`)).json(),
  });
  const venues: Venue[] = data?.venues ?? [];

  const createVenue = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Point de vente créé");
      queryClient.invalidateQueries({ queryKey: ["venues-admin"] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await fetch("/api/venues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Statut mis à jour");
      queryClient.invalidateQueries({ queryKey: ["venues-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maquis / Points de vente</h1>
          <p className="text-sm text-muted-foreground">Gérez vos différents établissements.</p>
        </div>
        {can(user?.role, "manageVenues") && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Nouveau point de vente
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {venues.map((v) => (
          <Card key={v.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  <Landmark className="h-4 w-4 text-primary" /> {v.name}
                </div>
                <Badge className={v.active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}>
                  {v.active ? "Actif" : "Inactif"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[v.type] ?? v.type}</p>
              {v.address && <p className="text-xs text-muted-foreground">{v.address}</p>}
              {v.phone && <p className="text-xs text-muted-foreground">{v.phone}</p>}
              {can(user?.role, "manageVenues") && (
                <Button size="sm" variant="outline" onClick={() => toggleActive.mutate({ id: v.id, active: !v.active })}>
                  {v.active ? "Désactiver" : "Réactiver"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && venues.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Aucun point de vente.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouveau point de vente</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createVenue.mutate({
                  name: String(form.get("name")),
                  type: String(form.get("type")),
                  address: String(form.get("address") || "") || undefined,
                  phone: String(form.get("phone") || "") || undefined,
                  qrOrderingEnabled: form.get("qrOrderingEnabled") === "on",
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Nom</Label>
                <Input name="name" required />
              </div>
              <div>
                <Label>Type</Label>
                <Select name="type" required>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Adresse</Label>
                <Input name="address" />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input name="phone" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="qrOrderingEnabled" className="h-4 w-4 rounded border-border" />
                Activer la commande par QR code
              </label>
              <Button type="submit" className="w-full" loading={createVenue.isPending}>
                Créer
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
