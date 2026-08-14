"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDate, slugify } from "@/lib/utils";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  X,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Pencil,
  Users,
  LogOut,
  KeyRound,
  Trash2,
} from "lucide-react";

type LicenseStatus = "active" | "suspended" | "expired";
type Role = "super_admin" | "gerant" | "manager" | "caissier" | "serveuse";

type Company = {
  id: number;
  name: string;
  slug: string;
  currency: string;
  createdAt: string;
  licenseStatus: LicenseStatus;
  licenseExpiresAt: string | null;
  maxUsers: number | null;
};

type AdminUser = {
  id: number;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  active: boolean;
  createdAt: string;
  companyId: number | null;
  companyName: string | null;
};

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  gerant: "Gérant",
  manager: "Manager",
  caissier: "Caissier",
  serveuse: "Serveuse",
};

// ============================= Durée de licence =============================
type DurationPreset = "none" | "7d" | "1m" | "3m" | "6m" | "1y" | "custom";

const DURATION_OPTIONS: { value: DurationPreset; label: string }[] = [
  { value: "none", label: "Illimitée (aucune date d'expiration)" },
  { value: "7d", label: "7 jours" },
  { value: "1m", label: "1 mois" },
  { value: "3m", label: "3 mois" },
  { value: "6m", label: "6 mois" },
  { value: "1y", label: "1 an" },
  { value: "custom", label: "Date personnalisée…" },
];

function computeExpiresAt(preset: DurationPreset, customDate: string): string | null {
  if (preset === "none") return null;
  if (preset === "custom") return customDate ? new Date(customDate).toISOString() : null;
  const d = new Date();
  if (preset === "7d") d.setDate(d.getDate() + 7);
  if (preset === "1m") d.setMonth(d.getMonth() + 1);
  if (preset === "3m") d.setMonth(d.getMonth() + 3);
  if (preset === "6m") d.setMonth(d.getMonth() + 6);
  if (preset === "1y") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function LicenseDurationField({ initialExpiresAt }: { initialExpiresAt?: string | null }) {
  const [preset, setPreset] = useState<DurationPreset>(initialExpiresAt ? "custom" : "none");
  const [customDate, setCustomDate] = useState(initialExpiresAt ? initialExpiresAt.slice(0, 10) : "");
  const expiresAt = computeExpiresAt(preset, customDate);

  return (
    <div className="space-y-2">
      <div>
        <Label>Durée de la licence</Label>
        <Select value={preset} onChange={(e) => setPreset(e.target.value as DurationPreset)}>
          {DURATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {preset === "custom" && (
        <div>
          <Label>Date d&apos;expiration</Label>
          <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} required />
        </div>
      )}
      {preset !== "custom" && preset !== "none" && expiresAt && (
        <p className="text-xs text-muted-foreground">Expirera le {formatDate(expiresAt)}</p>
      )}
      <input type="hidden" name="licenseExpiresAt" value={expiresAt ?? ""} />
    </div>
  );
}

function licenseBadge(company: Company) {
  const pastExpiry = company.licenseExpiresAt
    ? new Date(company.licenseExpiresAt).getTime() < Date.now()
    : false;
  const effective: LicenseStatus =
    company.licenseStatus === "active" && pastExpiry ? "expired" : company.licenseStatus;

  if (effective === "active") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
        <ShieldCheck className="h-3 w-3" /> Active
      </Badge>
    );
  }
  if (effective === "expired") {
    return (
      <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600">
        <ShieldAlert className="h-3 w-3" /> Expirée
      </Badge>
    );
  }
  return (
    <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
      <ShieldX className="h-3 w-3" /> Suspendue
    </Badge>
  );
}

// ============================= Page =============================

export default function PlatformAdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"companies" | "users">("companies");

  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companySlug, setCompanySlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const [showUserForm, setShowUserForm] = useState(false);
  const [resettingUser, setResettingUser] = useState<AdminUser | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deleteUserConfirmText, setDeleteUserConfirmText] = useState("");

  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => (await fetch("/api/companies")).json(),
  });
  const companies: Company[] = companiesData?.companies ?? [];

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await fetch("/api/admin/users")).json(),
  });
  const adminUsers: AdminUser[] = usersData?.users ?? [];

  const createCompany = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Entreprise créée");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setShowCompanyForm(false);
      setCompanySlug("");
      setSlugTouched(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLicense = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Licence mise à jour");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      setEditingCompany(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createUser = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Utilisateur créé");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowUserForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateUser = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Utilisateur mis à jour");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setResettingUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCompany = useMutation({
    mutationFn: async (payload: { id: number; confirmName: string }) => {
      const res = await fetch("/api/companies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Entreprise supprimée");
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeletingCompany(null);
      setDeleteConfirmText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (payload: { id: number; confirmEmail: string }) => {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Utilisateur supprimé");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeletingUser(null);
      setDeleteUserConfirmText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Administration plateforme</h1>
            <p className="text-xs text-muted-foreground">
              Toutes les entreprises, licences et comptes de la plateforme.
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Déconnexion
          </Button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-6">
          <button
            onClick={() => setTab("companies")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === "companies" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Entreprises &amp; licences
          </button>
          <button
            onClick={() => setTab("users")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Utilisateurs
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {tab === "companies" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Entreprises</h2>
                <p className="text-sm text-muted-foreground">Organisations clientes de la plateforme.</p>
              </div>
              <Button onClick={() => setShowCompanyForm(true)}>
                <Plus className="h-4 w-4" /> Nouvelle entreprise
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {companies.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold">
                        <Building2 className="h-4 w-4 text-primary" /> {c.name}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingCompany(c)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Gérer la licence"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingCompany(c);
                            setDeleteConfirmText("");
                          }}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Supprimer l'entreprise"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">/{c.slug} · {c.currency}</p>
                    <p className="text-xs text-muted-foreground">Créée le {formatDate(c.createdAt)}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {licenseBadge(c)}
                      <span className="text-xs text-muted-foreground">
                        {c.maxUsers != null ? `Max ${c.maxUsers} utilisateurs` : "Utilisateurs illimités"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.licenseExpiresAt ? `Expire le ${formatDate(c.licenseExpiresAt)}` : "Licence illimitée (aucune expiration)"}
                    </p>
                  </CardContent>
                </Card>
              ))}
              {!companiesLoading && companies.length === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Aucune entreprise.</p>
              )}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Utilisateurs</h2>
                <p className="text-sm text-muted-foreground">
                  Comptes de toutes les entreprises. Sert notamment à créer le premier gérant d&apos;une
                  entreprise qui vient d&apos;être créée.
                </p>
              </div>
              <Button onClick={() => setShowUserForm(true)}>
                <Plus className="h-4 w-4" /> Nouvel utilisateur
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Nom</th>
                      <th className="p-3 font-medium">Email</th>
                      <th className="p-3 font-medium">Entreprise</th>
                      <th className="p-3 font-medium">Rôle</th>
                      <th className="p-3 font-medium">Statut</th>
                      <th className="p-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-0">
                        <td className="p-3">{u.firstName} {u.lastName}</td>
                        <td className="p-3 text-muted-foreground">{u.email}</td>
                        <td className="p-3 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {u.companyName ?? "—"}
                        </td>
                        <td className="p-3">{ROLE_LABELS[u.role]}</td>
                        <td className="p-3">
                          {u.active ? (
                            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">Actif</Badge>
                          ) : (
                            <Badge className="border-destructive/30 bg-destructive/10 text-destructive">Désactivé</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setResettingUser(u)}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Réinitialiser le mot de passe"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => updateUser.mutate({ id: u.id, active: !u.active })}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title={u.active ? "Désactiver" : "Réactiver"}
                            >
                              {u.active ? <ShieldX className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => {
                                setDeletingUser(u);
                                setDeleteUserConfirmText("");
                              }}
                              className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!usersLoading && adminUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                          Aucun utilisateur.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* ---- Modale : nouvelle entreprise ---- */}
      {showCompanyForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvelle entreprise</h3>
              <button
                onClick={() => {
                  setShowCompanyForm(false);
                  setCompanySlug("");
                  setSlugTouched(false);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const maxUsersRaw = String(form.get("maxUsers") || "").trim();
                const expiresRaw = String(form.get("licenseExpiresAt") || "").trim();
                createCompany.mutate({
                  name: String(form.get("name")),
                  slug: slugify(String(form.get("slug"))),
                  currency: String(form.get("currency") || "XOF"),
                  licenseStatus: String(form.get("licenseStatus") || "active"),
                  licenseExpiresAt: expiresRaw || null,
                  maxUsers: maxUsersRaw ? Number(maxUsersRaw) : null,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Nom</Label>
                <Input
                  name="name"
                  required
                  onChange={(e) => {
                    if (!slugTouched) setCompanySlug(slugify(e.target.value));
                  }}
                />
              </div>
              <div>
                <Label>Slug (identifiant URL)</Label>
                <Input
                  name="slug"
                  placeholder="ex-entreprise"
                  pattern="[a-z0-9-]+"
                  required
                  value={companySlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setCompanySlug(e.target.value);
                  }}
                  onBlur={(e) => setCompanySlug(slugify(e.target.value))}
                />
              </div>
              <div>
                <Label>Devise</Label>
                <Input name="currency" defaultValue="XOF" required />
              </div>
              <div>
                <Label>Statut de la licence</Label>
                <Select name="licenseStatus" defaultValue="active" required>
                  <option value="active">Active</option>
                  <option value="suspended">Suspendue</option>
                  <option value="expired">Expirée</option>
                </Select>
              </div>
              <LicenseDurationField />
              <div>
                <Label>Quota d&apos;utilisateurs (optionnel)</Label>
                <Input name="maxUsers" type="number" min={1} placeholder="Illimité" />
              </div>
              <Button type="submit" className="w-full" loading={createCompany.isPending}>
                Créer
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ---- Modale : licence d'une entreprise ---- */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Licence — {editingCompany.name}</h3>
              <button onClick={() => setEditingCompany(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const maxUsersRaw = String(form.get("maxUsers") || "").trim();
                const expiresRaw = String(form.get("licenseExpiresAt") || "").trim();
                updateLicense.mutate({
                  id: editingCompany.id,
                  licenseStatus: String(form.get("licenseStatus")),
                  licenseExpiresAt: expiresRaw || null,
                  maxUsers: maxUsersRaw ? Number(maxUsersRaw) : null,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Statut</Label>
                <Select name="licenseStatus" defaultValue={editingCompany.licenseStatus} required>
                  <option value="active">Active</option>
                  <option value="suspended">Suspendue</option>
                  <option value="expired">Expirée</option>
                </Select>
              </div>
              <LicenseDurationField initialExpiresAt={editingCompany.licenseExpiresAt} />
              <div>
                <Label>Quota d&apos;utilisateurs (optionnel)</Label>
                <Input
                  name="maxUsers"
                  type="number"
                  min={1}
                  placeholder="Illimité"
                  defaultValue={editingCompany.maxUsers ?? ""}
                />
              </div>
              <Button type="submit" className="w-full" loading={updateLicense.isPending}>
                Enregistrer
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ---- Modale : nouvel utilisateur (n'importe quelle entreprise) ---- */}
      {showUserForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvel utilisateur</h3>
              <button onClick={() => setShowUserForm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                createUser.mutate({
                  companyId: Number(form.get("companyId")),
                  email: String(form.get("email")).toLowerCase().trim(),
                  password: String(form.get("password")),
                  role: String(form.get("role")),
                  firstName: String(form.get("firstName")),
                  lastName: String(form.get("lastName")),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Entreprise</Label>
                <Select name="companyId" required defaultValue="">
                  <option value="" disabled>
                    Choisir une entreprise…
                  </option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
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
                <Select name="role" defaultValue="gerant" required>
                  <option value="super_admin">Super admin (entreprise)</option>
                  <option value="gerant">Gérant</option>
                  <option value="manager">Manager</option>
                  <option value="caissier">Caissier</option>
                  <option value="serveuse">Serveuse</option>
                </Select>
              </div>
              <Button type="submit" className="w-full" loading={createUser.isPending}>
                <Users className="h-4 w-4" /> Créer l&apos;utilisateur
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ---- Modale : suppression définitive d'une entreprise ---- */}
      {deletingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-destructive">
                <Trash2 className="h-5 w-5" /> Supprimer {deletingCompany.name}
              </h3>
              <button
                onClick={() => {
                  setDeletingCompany(null);
                  setDeleteConfirmText("");
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Action irréversible : tous les établissements, utilisateurs, produits, commandes et
              données de cette entreprise seront définitivement supprimés.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                deleteCompany.mutate({ id: deletingCompany.id, confirmName: deleteConfirmText });
              }}
              className="space-y-3"
            >
              <div>
                <Label>
                  Tapez <span className="font-semibold text-foreground">{deletingCompany.name}</span> pour confirmer
                </Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                loading={deleteCompany.isPending}
                disabled={deleteConfirmText.trim().toLowerCase() !== deletingCompany.name.trim().toLowerCase()}
              >
                Supprimer définitivement
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ---- Modale : suppression définitive d'un utilisateur ---- */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-destructive">
                <Trash2 className="h-5 w-5" /> Supprimer {deletingUser.firstName} {deletingUser.lastName}
              </h3>
              <button
                onClick={() => {
                  setDeletingUser(null);
                  setDeleteUserConfirmText("");
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Action irréversible : ce compte sera définitivement supprimé. Les ventes, commandes et
              autres données déjà créées par cet utilisateur seront conservées mais ne seront plus
              rattachées à personne.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                deleteUser.mutate({ id: deletingUser.id, confirmEmail: deleteUserConfirmText });
              }}
              className="space-y-3"
            >
              <div>
                <Label>
                  Tapez <span className="font-semibold text-foreground">{deletingUser.email}</span> pour confirmer
                </Label>
                <Input
                  value={deleteUserConfirmText}
                  onChange={(e) => setDeleteUserConfirmText(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                loading={deleteUser.isPending}
                disabled={deleteUserConfirmText.trim().toLowerCase() !== deletingUser.email.trim().toLowerCase()}
              >
                Supprimer définitivement
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ---- Modale : réinitialiser le mot de passe ---- */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Nouveau mot de passe — {resettingUser.firstName} {resettingUser.lastName}
              </h3>

              <button onClick={() => setResettingUser(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                updateUser.mutate({
                  id: resettingUser.id,
                  password: String(form.get("password")),
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Nouveau mot de passe</Label>
                <Input name="password" type="password" minLength={6} required />
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
