"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Trash2, Wand2 } from "lucide-react";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { addDays, dateKeysBetween, weekdayOf } from "@/lib/shift-plan-client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

type Shift = "jour" | "soir";
type Group = { id: number; name: string };
type Block = { id: number; groupId: number; shift: Shift; startDate: string; endDate: string };
type Member = {
  id: number; firstName: string; lastName: string;
  shiftGroup: Shift | null; restDay: number | null; rotationGroupId: number | null;
};
type PlanData = {
  groups: Group[]; blocks: Block[]; members: Member[]; days: string[];
  schedule: { userId: number; days: (Shift | "repos" | null)[] }[];
};

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const LETTERS = ["D", "L", "M", "M", "J", "V", "S"];
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const lastDayOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;
};
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};
const cell = (s: Shift | "repos" | null) => (s === "jour" ? "☀️" : s === "soir" ? "🌙" : s === "repos" ? "😴" : "·");

async function send(url: string, method: string, payload?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Erreur");
  return body;
}

export default function PlanningPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const manager = can(user?.role, "manageServers");
  const venueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const [month, setMonth] = useState(() => monthKey(new Date()));
  const from = `${month}-01`;
  const to = lastDayOf(month);
  const [newGroup, setNewGroup] = useState("");
  const [draft, setDraft] = useState<{ forData: PlanData | undefined; grid: Record<number, (Shift | null)[]> } | null>(null);
  const [gen, setGen] = useState({ daysPerBlock: 3, mode: "matin-tourne" as "matin-tourne" | "un-par-service" });

  const queryKey = useMemo(() => ["shift-plan", venueId, from, to], [venueId, from, to]);
  const { data, isLoading } = useQuery<PlanData>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/shift-plan?venueId=${venueId}&from=${from}&to=${to}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      return body;
    },
    enabled: !!venueId,
  });
  const days = data?.days ?? dateKeysBetween(from, to);

  // Grille éditable groupes × jours : celle du serveur, tant que le manager n'a rien modifié.
  const base = useMemo(() => {
    const g: Record<number, (Shift | null)[]> = {};
    for (const grp of data?.groups ?? []) {
      g[grp.id] = (data?.days ?? []).map((d) => {
        const b = data?.blocks.find((x) => x.groupId === grp.id && x.startDate <= d && d <= x.endDate);
        return b ? b.shift : null;
      });
    }
    return g;
  }, [data]);
  const dirty = draft !== null && draft.forData === data;
  const grid = dirty ? draft.grid : base;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shift-plan"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
  };
  const onError = (e: Error) => toast.error(e.message);

  const addGroup = useMutation({
    mutationFn: (name: string) => send("/api/shift-groups", "POST", { venueId, name }),
    onSuccess: () => { setNewGroup(""); refresh(); },
    onError,
  });
  const removeGroup = useMutation({
    mutationFn: (id: number) => send(`/api/shift-groups?id=${id}`, "DELETE"),
    onSuccess: () => { toast.success("Groupe supprimé"); refresh(); },
    onError,
  });
  const patchUser = useMutation({
    mutationFn: (p: { id: number; restDay?: number | null; rotationGroupId?: number | null }) => send("/api/users", "PATCH", p),
    onSuccess: refresh,
    onError,
  });
  const generate = useMutation({
    mutationFn: () =>
      send("/api/shift-plan", "POST", {
        venueId, startDate: from, endDate: to, daysPerBlock: gen.daysPerBlock, mode: gen.mode,
        groupIds: (data?.groups ?? []).map((g) => g.id),
      }),
    onSuccess: () => { toast.success("Planning du mois prérempli"); refresh(); },
    onError,
  });
  const save = useMutation({
    mutationFn: () => {
      const blocks: { groupId: number; shift: Shift; startDate: string; endDate: string }[] = [];
      for (const [id, row] of Object.entries(grid)) {
        let i = 0;
        while (i < row.length) {
          const shift = row[i];
          if (!shift) { i++; continue; }
          let j = i;
          while (j + 1 < row.length && row[j + 1] === shift) j++;
          blocks.push({ groupId: Number(id), shift, startDate: days[i], endDate: days[j] });
          i = j + 1;
        }
      }
      return send("/api/shift-plan", "PUT", { venueId, from, to, blocks });
    },
    onSuccess: () => { toast.success("Planning enregistré"); refresh(); },
    onError,
  });

  const cycle = (groupId: number, i: number) => {
    if (!manager) return;
    const row = [...(grid[groupId] ?? [])];
    row[i] = row[i] === null ? "jour" : row[i] === "jour" ? "soir" : null;
    setDraft({ forData: data, grid: { ...grid, [groupId]: row } });
  };

  const shiftMonth = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y, m - 1 + n, 1)));
  };
  const groups = data?.groups ?? [];
  const members = data?.members ?? [];
  const today = new Date().toISOString().slice(0, 10);

  if (!venueId) return <p className="text-sm text-muted-foreground">Choisissez d&apos;abord un point de vente.</p>;

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <PageHeader
        eyebrow="Équipe de salle"
        title="Planning des équipes"
        description="Groupes A, B, C… qui alternent matin et soir, et un jour de repos par semaine pour chaque serveuse."
        actions={
          <Link href="/servers" className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
            ← Serveuses
          </Link>
        }
      />

      {/* 1. Groupes et serveuses */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-base font-semibold">1. Groupes et jours de repos</h2>
        <div className="flex flex-wrap items-center gap-2">
          {groups.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary-strong">
              Groupe {g.name}
              {manager && (
                <button
                  aria-label={`Supprimer le groupe ${g.name}`}
                  className="rounded-full p-1 hover:bg-card"
                  onClick={() => confirm(`Supprimer le groupe ${g.name} ? Ses membres reviennent à leur équipe fixe.`) && removeGroup.mutate(g.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          {groups.length === 0 && <span className="text-sm text-muted-foreground">Aucun groupe pour l&apos;instant.</span>}
        </div>
        {manager && (
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (newGroup.trim()) addGroup.mutate(newGroup.trim()); }}
          >
            <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Nom du groupe (ex. A)" maxLength={40} className="max-w-56" />
            <Button type="submit" size="md" loading={addGroup.isPending}><Plus className="h-4 w-4" /> Ajouter</Button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Serveuse</th>
                <th className="py-2 pr-3 font-medium">Groupe</th>
                <th className="py-2 font-medium">Jour de repos</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium">{m.firstName} {m.lastName}</td>
                  <td className="py-2 pr-3">
                    <Select
                      aria-label={`Groupe de ${m.firstName}`}
                      className="h-9"
                      disabled={!manager}
                      value={m.rotationGroupId ?? ""}
                      onChange={(e) => patchUser.mutate({ id: m.id, rotationGroupId: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">{m.shiftGroup ? (m.shiftGroup === "jour" ? "Aucun (équipe fixe : matin)" : "Aucun (équipe fixe : soir)") : "Aucun"}</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>Groupe {g.name}</option>)}
                    </Select>
                  </td>
                  <td className="py-2">
                    <Select
                      aria-label={`Jour de repos de ${m.firstName}`}
                      className="h-9"
                      disabled={!manager}
                      value={m.restDay ?? ""}
                      onChange={(e) => patchUser.mutate({ id: m.id, restDay: e.target.value === "" ? null : Number(e.target.value) })}
                    >
                      <option value="">Aucun</option>
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
              {!isLoading && members.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">Aucune serveuse dans ce point de vente.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Mois */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
        <Button variant="ghost" size="icon" aria-label="Mois précédent" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-5 w-5" /></Button>
        <span className="font-display text-base font-semibold capitalize">{monthLabel(month)}</span>
        <Button variant="ghost" size="icon" aria-label="Mois suivant" onClick={() => shiftMonth(1)}><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {/* 2. Rotation automatique */}
      {manager && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-base font-semibold">2. Préremplir la rotation du mois</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Jours par groupe</Label>
              <Input type="number" min={1} max={31} value={gen.daysPerBlock} onChange={(e) => setGen({ ...gen, daysPerBlock: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Façon de tourner</Label>
              <Select value={gen.mode} onChange={(e) => setGen({ ...gen, mode: e.target.value as typeof gen.mode })}>
                <option value="matin-tourne">Le matin tourne ; les autres groupes sont au soir</option>
                <option value="un-par-service">Un groupe au matin, un au soir, le dernier se repose</option>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {gen.mode === "matin-tourne"
              ? `Ex. : le groupe ${groups[0]?.name ?? "A"} fait ${gen.daysPerBlock} jours de matin pendant que les autres sont au soir, puis le suivant prend le matin, et ainsi de suite.`
              : `Ex. : ${gen.daysPerBlock} jours : ${groups[0]?.name ?? "A"} au matin, ${groups[1]?.name ?? "B"} au soir, ${groups[2]?.name ?? "C"} se repose ; puis tout avance d'un cran.`}{" "}
            Remplace le planning de {monthLabel(month)} ; vous pouvez ensuite corriger jour par jour.
          </p>
          <Button onClick={() => generate.mutate()} loading={generate.isPending} disabled={groups.length === 0}>
            <Wand2 className="h-4 w-4" /> Préremplir {monthLabel(month)}
          </Button>
        </section>
      )}

      {/* 3. Grille par groupe */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">3. Planning des groupes</h2>
          {manager && (
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              {dirty ? "Enregistrer les changements" : "Enregistré"}
            </Button>
          )}
        </div>
        {manager && <p className="text-xs text-muted-foreground">Touchez une case : ☀️ matin → 🌙 soir → vide (repos du groupe).</p>}
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-center text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card pr-2 text-left font-medium text-muted-foreground">Groupe</th>
                {days.map((d) => (
                  <th key={d} className={cn("min-w-7 font-medium", d === today ? "text-primary" : "text-muted-foreground")}>
                    <div>{d.slice(8)}</div>
                    <div className="text-[10px] opacity-70">{LETTERS[weekdayOf(d)]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <th className="sticky left-0 bg-card pr-2 text-left font-semibold">{g.name}</th>
                  {days.map((d, i) => (
                    <td key={d}>
                      <button
                        disabled={!manager}
                        onClick={() => cycle(g.id, i)}
                        aria-label={`Groupe ${g.name}, ${d}`}
                        className={cn(
                          "h-8 w-7 rounded-md border border-border text-sm",
                          grid[g.id]?.[i] === "jour" && "bg-sun-soft",
                          grid[g.id]?.[i] === "soir" && "bg-accent/15",
                          d === today && "ring-1 ring-primary",
                          manager && "hover:bg-muted"
                        )}
                      >
                        {cell(grid[g.id]?.[i] ?? null)}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Résultat par serveuse */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-base font-semibold">Résultat pour chaque serveuse</h2>
        <p className="text-xs text-muted-foreground">☀️ matin · 🌙 soir · 😴 repos · · rien de prévu. Le jour de repos hebdomadaire l&apos;emporte toujours.</p>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-center text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card pr-2 text-left font-medium text-muted-foreground">Serveuse</th>
                {days.map((d) => (
                  <th key={d} className={cn("min-w-7 font-medium", d === today ? "text-primary" : "text-muted-foreground")}>
                    <div>{d.slice(8)}</div>
                    <div className="text-[10px] opacity-70">{LETTERS[weekdayOf(d)]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const row = data?.schedule.find((s) => s.userId === m.id)?.days ?? [];
                return (
                  <tr key={m.id}>
                    <th className="sticky left-0 whitespace-nowrap bg-card pr-2 text-left font-medium">{m.firstName}</th>
                    {days.map((d, i) => (
                      <td key={d} className={cn("h-7 w-7 rounded-md border border-border/60", d === today && "ring-1 ring-primary", row[i] === "jour" && "bg-sun-soft", row[i] === "soir" && "bg-accent/15")}>
                        {cell(row[i] ?? null)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
