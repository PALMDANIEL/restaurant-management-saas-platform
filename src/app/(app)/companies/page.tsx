"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDate, slugify } from "@/lib/utils";
import { toast } from "sonner";
import { Building2, Plus, X, ShieldAlert, ShieldCheck, ShieldX, Pencil } from "lucide-react";

type LicenseStatus = "active" | "suspended" | "expired";

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

// ============================= Durée de licence =============================
// Petit sélecteur "durée de vie" (7 jours / 1 mois / 3 mois / 6 mois / 1 an /
// illimitée / date personnalisée) qui calcule la date d'expiration à la volée,
// plutôt que d'obliger à saisir une date brute à chaque fois.
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
  const [customDate, setCustomDate] = useState(
    initialExpiresAt ? initialExpiresAt.slice(0, 10) : ""
  );
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
          <Input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            required
          />
        </div>
      )}
      {preset !== "custom" && preset !== "none" && expiresAt && (
        <p className="text-xs text-muted-foreground">Expirera le {formatDate(expiresAt)}</p>
      )}
      {/* Valeur envoyée avec le reste du formulaire (FormData la lit comme n'importe quel champ) */}
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

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [slugValue, setSlugValue] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => (await fetch(`/api/companies`)).json(),
  });
  const companies: Company[] = data?.companies ?? [];

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
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setShowForm(false);
      setSlugValue("");
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
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entreprises</h1>
          <p className="text-sm text-muted-foreground">Organisations clientes de la plateforme.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
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
                <button
                  onClick={() => setEditing(c)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Gérer la licence"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
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
        {!isLoading && companies.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Aucune entreprise.</p>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Nouvelle entreprise</h3>
              <button onClick={() => setShowForm(false)}>
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
                <Input name="name" required />
              </div>
              <div>
                <Label>Slug (identifiant URL)</Label>
                <Input name="slug" placeholder="ex-entreprise" pattern="[a-z0-9-]+" required />
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Licence — {editing.name}</h3>
              <button onClick={() => setEditing(null)}>
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
                  id: editing.id,
                  licenseStatus: String(form.get("licenseStatus")),
                  licenseExpiresAt: expiresRaw || null,
                  maxUsers: maxUsersRaw ? Number(maxUsersRaw) : null,
                });
              }}
              className="space-y-3"
            >
              <div>
                <Label>Statut</Label>
                <Select name="licenseStatus" defaultValue={editing.licenseStatus} required>
                  <option value="active">Active</option>
                  <option value="suspended">Suspendue</option>
                  <option value="expired">Expirée</option>
                </Select>
              </div>
              <LicenseDurationField initialExpiresAt={editing.licenseExpiresAt} />
              <div>
                <Label>Quota d&apos;utilisateurs (optionnel)</Label>
                <Input
                  name="maxUsers"
                  type="number"
                  min={1}
                  placeholder="Illimité"
                  defaultValue={editing.maxUsers ?? ""}
                />
              </div>
              <Button type="submit" className="w-full" loading={updateLicense.isPending}>
                Enregistrer
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
