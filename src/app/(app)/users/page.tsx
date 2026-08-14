"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { UserPlus, X, ShieldCheck, ShieldOff, Pencil } from "lucide-react";

type StaffUser = {
  id: number;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  active: boolean;
  matricule: string | null;
  venueIds: number[];
};
type Venue = { id: number; name: string };

const ROLE_OPTIONS = ["super_admin", "gerant", "manager", "caissier", "serveuse"];

export default function UsersPage() {
  const venues = useAppStore((s) => s.venues) as Venue[];
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedVenueIds, setSelectedVenueIds] = useState<number[]>([]);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editVenueIds, setEditVenueIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await fetch(`/api/users`)).json(),
  });
  const staff: StaffUser[] = data?.users ?? [];
  const seatUsage: { used: number; max: number | null } = data?.seatUsage ?? { used: 0, max: null };
  const quotaReached = seatUsage.max != null && seatUsage.used >= seatUsage.max;

  const createUser = useMutation({
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
      toast.success("Utilisateur créé");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setSelectedVenueIds([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Statut mis à jour");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateUser = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Utilisateur mis à jour");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      setEditingUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(u: StaffUser) {
    setEditingUser(u);
    setEditVenueIds(u.venueIds);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Gérez les comptes et accès de votre équipe.</p>
        </div>
        <div className="flex items-center gap-3">
          {seatUsage.max != null && (
            <Badge
              className={
                quotaReached
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {seatUsage.used}/{seatUsage.max} licences
            </Badge>
          )}
          {can(user?.role, "manageUsers") && (
            <Button
              onClick={() => setShowForm(true)}
              disabled={quotaReached}
              title={quotaReached ? "Quota de licences atteint" : undefined}
            >
              <UserPlus className="h-4 w-4" /> Nouvel utilisateur
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Équipe ({staff.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2">Nom</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Rôle</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2">Points de vente</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 font-medium">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{u.email}</td>
                    <td className="py-2.5">
                      <Badge className="border-border bg-muted text-foreground">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                    </td>
                    <td className="py-2.5">
                      <Badge
                        className={
                          u.active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-red-300 bg-red-50 text-red-700"
                        }
                      >
                        {u.active ? "Actif" : "Désactivé"}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {u.venueIds.length === 0 ? (
                          <span className="text-xs text-amber-600">Aucun point de vente</span>
                        ) : (
                          u.venueIds.map((vid) => {
                            const v = venues.find((venue) => venue.id === vid);
                            return v ? (
                              <Badge key={vid} className="border-border bg-muted text-foreground">
                                {v.name}
                              </Badge>
                            ) : null;
                          })
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {can(user?.role, "manageUsers") && (
                          <button
                            onClick={() => openEdit(u)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Modifier"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {can(user?.role, "manageUsers") && u.id !== user?.id && (
                          <button
                            onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}
                            className={u.active ? "text-red-500" : "text-emerald-600"}
                            title={u.active ? "Désactiver" : "Activer"}
                          >
                            {u.active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isLoading && staff.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun utilisateur.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvel utilisateur</h3>
              <button onClick={() => setShowForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createUser.mutate({
                  email: String(form.get("email")),
                  password: String(form.get("password")),
                  role: String(form.get("role")),
                  firstName: String(form.get("firstName")),
                  lastName: String(form.get("lastName")),
                  phone: String(form.get("phone") || "") || undefined,
                  matricule: String(form.get("matricule") || "") || undefined,
                  venueIds: selectedVenueIds,
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
                <Label>Rôle</Label>
                <Select name="role" required>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input name="phone" />
              </div>
              <div>
                <Label>Matricule (optionnel)</Label>
                <Input name="matricule" />
              </div>
              <div>
                <Label>Points de vente assignés</Label>
                <div className="flex flex-wrap gap-2">
                  {venues.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setSelectedVenueIds((prev) =>
                          prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selectedVenueIds.includes(v.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-foreground"
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" loading={createUser.isPending}>
                Créer l&apos;utilisateur
              </Button>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Modifier {editingUser.firstName} {editingUser.lastName}
              </h3>
              <button onClick={() => setEditingUser(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const newPassword = String(form.get("password") || "");
                updateUser.mutate({
                  id: editingUser.id,
                  role: String(form.get("role")),
                  firstName: String(form.get("firstName")),
                  lastName: String(form.get("lastName")),
                  phone: String(form.get("phone") || "") || undefined,
                  matricule: String(form.get("matricule") || "") || undefined,
                  venueIds: editVenueIds,
                  ...(newPassword ? { password: newPassword } : {}),
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prénom</Label>
                  <Input name="firstName" defaultValue={editingUser.firstName} required />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input name="lastName" defaultValue={editingUser.lastName} required />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input value={editingUser.email} disabled />
              </div>
              <div>
                <Label>Nouveau mot de passe (laisser vide pour ne pas changer)</Label>
                <Input name="password" type="password" minLength={6} />
              </div>
              <div>
                <Label>Rôle</Label>
                <Select name="role" defaultValue={editingUser.role} required>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input name="phone" defaultValue={editingUser.phone ?? ""} />
              </div>
              <div>
                <Label>Matricule (optionnel)</Label>
                <Input name="matricule" defaultValue={editingUser.matricule ?? ""} />
              </div>
              <div>
                <Label>Points de vente assignés</Label>
                <p className="mb-1 text-xs text-muted-foreground">
                  Une serveuse doit être assignée à un point de vente pour apparaître dans les sélecteurs de
                  Commandes et POS.
                </p>
                <div className="flex flex-wrap gap-2">
                  {venues.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setEditVenueIds((prev) =>
                          prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        editVenueIds.includes(v.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-foreground"
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" loading={updateUser.isPending}>
                Enregistrer
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
