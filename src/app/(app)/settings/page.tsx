"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { ROLE_LABELS, initials } from "@/lib/utils";
import { User, Lock, Store, Users, Receipt, Plus, X } from "lucide-react";

type Venue = { id: number; name: string; address: string | null; phone: string | null };
type StaffUser = { id: number; firstName: string; lastName: string; phone: string | null; active: boolean };
type ExpenseCategory = { id: number; name: string };

export default function SettingsPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;
  const [showServerForm, setShowServerForm] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const { data: venuesData } = useQuery({
    queryKey: ["venues-full"],
    queryFn: async () => (await fetch("/api/venues")).json(),
    enabled: can(user?.role, "manageVenues"),
  });
  const currentVenue: Venue | undefined = venuesData?.venues?.find((v: Venue) => v.id === targetVenueId);

  const { data: serversData } = useQuery({
    queryKey: ["users", "serveuse"],
    queryFn: async () => (await fetch(`/api/users?role=serveuse`)).json(),
    enabled: can(user?.role, "manageServers"),
  });
  const servers: StaffUser[] = serversData?.users ?? [];

  const { data: catData } = useQuery({
    queryKey: ["expense-categories", venueParam],
    queryFn: async () => (await fetch(`/api/expense-categories?venueId=${venueParam}`)).json(),
    enabled: can(user?.role, "manageExpenses"),
  });
  const categories: ExpenseCategory[] = catData?.categories ?? [];

  const updateProfile = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      toast.success("Profil mis à jour");
      if (data.user) setUser({ ...user, ...data.user });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePassword = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => toast.success("Mot de passe mis à jour"),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateVenue = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/venues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Point de vente mis à jour");
      queryClient.invalidateQueries({ queryKey: ["venues-full"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
      setShowServerForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleServerActive = useMutation({
    mutationFn: async (payload: { id: number; active: boolean }) => {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/expense-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: targetVenueId, name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Catégorie ajoutée");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      setNewCategory("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expense-categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Catégorie supprimée");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Gère ton profil et les réglages de ton point de vente.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <User className="h-4 w-4" /> Profil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              updateProfile.mutate({
                firstName: String(form.get("firstName")),
                lastName: String(form.get("lastName")),
                phone: String(form.get("phone") || "") || undefined,
              });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prénom</Label>
                <Input name="firstName" defaultValue={user?.firstName} required />
              </div>
              <div>
                <Label>Nom</Label>
                <Input name="lastName" defaultValue={user?.lastName} required />
              </div>
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input name="phone" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={user?.email} disabled />
            </div>
            <div>
              <Label>Rôle</Label>
              <Input value={user?.role ? ROLE_LABELS[user.role] : ""} disabled />
            </div>
            <Button type="submit" loading={updateProfile.isPending}>
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Lock className="h-4 w-4" /> Mot de passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const newPassword = String(form.get("newPassword"));
              const confirm = String(form.get("confirmPassword"));
              if (newPassword !== confirm) {
                toast.error("Les mots de passe ne correspondent pas");
                return;
              }
              updatePassword.mutate({
                currentPassword: String(form.get("currentPassword")),
                newPassword,
              });
              e.currentTarget.reset();
            }}
            className="space-y-3"
          >
            <div>
              <Label>Mot de passe actuel</Label>
              <Input name="currentPassword" type="password" required />
            </div>
            <div>
              <Label>Nouveau mot de passe</Label>
              <Input name="newPassword" type="password" minLength={6} required />
            </div>
            <div>
              <Label>Confirmer le nouveau mot de passe</Label>
              <Input name="confirmPassword" type="password" minLength={6} required />
            </div>
            <Button type="submit" loading={updatePassword.isPending}>
              Changer le mot de passe
            </Button>
          </form>
        </CardContent>
      </Card>

      {can(user?.role, "manageVenues") && currentVenue && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Store className="h-4 w-4" /> Point de vente : {currentVenue.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                updateVenue.mutate({
                  id: currentVenue.id,
                  name: String(form.get("name")),
                  address: String(form.get("address") || "") || undefined,
                  phone: String(form.get("phone") || "") || undefined,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Nom</Label>
                <Input name="name" defaultValue={currentVenue.name} required />
              </div>
              <div>
                <Label>Adresse</Label>
                <Input name="address" defaultValue={currentVenue.address ?? ""} />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input name="phone" defaultValue={currentVenue.phone ?? ""} />
              </div>
              <Button type="submit" loading={updateVenue.isPending}>
                Enregistrer
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {can(user?.role, "manageServers") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base font-semibold text-foreground">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Serveuses
              </span>
              <Button size="sm" variant="outline" onClick={() => setShowServerForm((s) => !s)}>
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {showServerForm && (
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
                className="space-y-3 rounded-xl border border-border p-3"
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
                <Button type="submit" size="sm" loading={createServer.isPending}>
                  Créer le compte
                </Button>
              </form>
            )}

            <div className="space-y-2">
              {servers.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(s.firstName, s.lastName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.phone || "—"}</p>
                  </div>
                  <Badge className={s.active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}>
                    {s.active ? "Actif" : "Inactif"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={toggleServerActive.isPending}
                    onClick={() => toggleServerActive.mutate({ id: s.id, active: !s.active })}
                  >
                    {s.active ? "Désactiver" : "Activer"}
                  </Button>
                </div>
              ))}
              {servers.length === 0 && <p className="text-sm text-muted-foreground">Aucune serveuse enregistrée.</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Pour le classement de performance et le détail complet, va sur l&apos;écran Serveuses.
            </p>
          </CardContent>
        </Card>
      )}

      {can(user?.role, "manageExpenses") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Receipt className="h-4 w-4" /> Catégories de dépenses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newCategory.trim()) addCategory.mutate(newCategory.trim());
              }}
              className="flex gap-2"
            >
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Ex: Internet, Sécurité..."
              />
              <Button type="submit" size="sm" loading={addCategory.isPending} disabled={!newCategory.trim()}>
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Badge key={c.id} className="gap-1.5 border-border bg-muted text-foreground">
                  {c.name}
                  <button onClick={() => deleteCategory.mutate(c.id)} className="text-muted-foreground hover:text-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {categories.length === 0 && <p className="text-sm text-muted-foreground">Aucune catégorie configurée.</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Ces catégories apparaissent dans le formulaire de l&apos;écran Dépenses. Supprimer une catégorie n&apos;affecte
              pas les dépenses déjà enregistrées avec ce libellé.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
