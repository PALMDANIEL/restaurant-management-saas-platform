"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { initials } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import { NOTE_WEIGHTS } from "@/lib/staff-scoring-rules";
import {
  UserPlus,
  X,
  CheckCircle2,
  XCircle,
  Timer,
  Gauge,
  Sun,
  Moon,
  LogIn,
  LogOut,
  Trophy,
  Settings2,
  Clock,
  Star,
  History,
  PencilLine,
  AlertTriangle,
} from "lucide-react";
import { BehaviorDialog } from "@/components/servers/behavior-dialog";
import { AttendanceDialog } from "@/components/servers/attendance-dialog";
import { HistoryDialog } from "@/components/servers/history-dialog";
import {
  formatFcfa,
  formatHours,
  formatNote,
  formatTime,
  noteLabel,
  noteTone,
  type StaffDay,
} from "@/components/servers/types";

type StaffUser = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  active: boolean;
  matricule: string | null;
  shiftGroup: "jour" | "soir" | null;
};
type MonthlyPerf = {
  id: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgServiceMinutes: number | null;
  score: number | null;
};
type ShiftSettings = {
  venueId: number;
  dayStartTime: string;
  dayEndTime: string;
  nightStartTime: string;
  nightEndTime: string;
};

function scoreLabel(score: number | null) {
  if (score === null) return { label: "Pas assez de données", className: "border-slate-300 bg-slate-50 text-slate-600" };
  if (score >= 80) return { label: "Excellent", className: "border-emerald-300 bg-emerald-50 text-emerald-700" };
  if (score >= 60) return { label: "Bon", className: "border-sky-300 bg-sky-50 text-sky-700" };
  if (score >= 40) return { label: "Moyen", className: "border-amber-300 bg-amber-50 text-amber-700" };
  return { label: "À améliorer", className: "border-red-300 bg-red-50 text-red-700" };
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ServersPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [workDate, setWorkDate] = useState(todayKey());
  const [dialog, setDialog] = useState<{ kind: "behavior" | "attendance" | "history"; day: StaffDay } | null>(null);

  const targetVenueId = venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["users", "serveuse"],
    queryFn: async () => (await fetch(`/api/users?role=serveuse`)).json(),
  });
  const servers: StaffUser[] = useMemo(() => data?.users ?? [], [data]);

  const { data: monthlyData } = useQuery({
    queryKey: ["server-performance", venueParam],
    queryFn: async () => (await fetch(`/api/servers/performance?venueId=${venueParam}`)).json(),
  });
  const monthlyById = new Map<number, MonthlyPerf>((monthlyData?.performance ?? []).map((p: MonthlyPerf) => [p.id, p]));

  const { data: dailyData } = useQuery({
    queryKey: ["staff-performance", targetVenueId, workDate],
    queryFn: async () => (await fetch(`/api/staff-performance?venueId=${targetVenueId}&workDate=${workDate}`)).json(),
    enabled: !!targetVenueId,
    refetchInterval: 30000,
  });
  const dailyById = new Map<number, StaffDay>((dailyData?.staff ?? []).map((p: StaffDay) => [p.id, p]));
  const settings: ShiftSettings | undefined = dailyData?.settings;
  const maxSales = Math.max(1, ...[...dailyById.values()].map((d) => d.totalSales));
  // Meilleure note du jour dans chaque équipe (trophée).
  const bestNote = new Map<string, number>();
  for (const d of dailyById.values()) {
    if (d.note === null) continue;
    const key = d.shiftGroup ?? "";
    bestNote.set(key, Math.max(bestNote.get(key) ?? 0, d.note));
  }

  const dayTeam = useMemo(() => servers.filter((s) => s.shiftGroup === "jour"), [servers]);
  const nightTeam = useMemo(() => servers.filter((s) => s.shiftGroup === "soir"), [servers]);
  const unassigned = useMemo(() => servers.filter((s) => !s.shiftGroup), [servers]);

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

  const setShiftGroup = useMutation({
    mutationFn: async ({ id, shiftGroup }: { id: number; shiftGroup: "jour" | "soir" }) => {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, shiftGroup }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Équipe mise à jour");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clockIn = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: targetVenueId, userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Arrivée pointée");
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clockOut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Départ pointé");
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/shift-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: targetVenueId, ...payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Horaires mis à jour");
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
      setShowSettings(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function ServerCard({ s }: { s: StaffUser }) {
    const monthly = monthlyById.get(s.id);
    const daily = dailyById.get(s.id);
    const sc = scoreLabel(monthly?.score ?? null);
    const isTop = !!daily && daily.note !== null && daily.note === bestNote.get(daily.shiftGroup ?? "");
    const manager = can(user?.role, "manageServers");
    const p = daily?.punctuality;

    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(s.firstName, s.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-medium">
                {isTop && <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                {s.firstName} {s.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{s.phone || s.matricule || "—"}</p>
            </div>
            <Badge className={s.active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}>
              {s.active ? "Actif" : "Inactif"}
            </Badge>
          </div>

          {/* Équipe jour/soir */}
          {can(user?.role, "manageServers") ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setShiftGroup.mutate({ id: s.id, shiftGroup: "jour" })}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                  s.shiftGroup === "jour" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border text-muted-foreground"
                }`}
              >
                <Sun className="h-3 w-3" /> Journée
              </button>
              <button
                type="button"
                onClick={() => setShiftGroup.mutate({ id: s.id, shiftGroup: "soir" })}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                  s.shiftGroup === "soir" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-border text-muted-foreground"
                }`}
              >
                <Moon className="h-3 w-3" /> Soirée
              </button>
            </div>
          ) : (
            s.shiftGroup && (
              <Badge className={s.shiftGroup === "jour" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-indigo-300 bg-indigo-50 text-indigo-700"}>
                {s.shiftGroup === "jour" ? "☀️ Journée" : "🌙 Soirée"}
              </Badge>
            )
          )}

          {/* Score qualité du mois (existant) */}
          <div className="flex items-center justify-between rounded-xl border border-border p-2.5">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Score du mois</span>
            </div>
            <div className="flex items-center gap-2">
              {monthly?.score !== null && monthly?.score !== undefined && (
                <span className="text-lg font-bold">{monthly.score}/100</span>
              )}
              <Badge className={sc.className}>{sc.label}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 p-2">
              <CheckCircle2 className="mx-auto h-3.5 w-3.5 text-emerald-600" />
              <p className="mt-1 text-sm font-semibold">{monthly?.completedOrders ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Servies</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <XCircle className="mx-auto h-3.5 w-3.5 text-red-500" />
              <p className="mt-1 text-sm font-semibold">{monthly?.cancelledOrders ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Annulées</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <Timer className="mx-auto h-3.5 w-3.5 text-sky-600" />
              <p className="mt-1 text-sm font-semibold">
                {monthly?.avgServiceMinutes !== null && monthly?.avgServiceMinutes !== undefined ? `${monthly.avgServiceMinutes} min` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">Temps moyen</p>
            </div>
          </div>

          {/* Note du jour : ventes + comportement + ponctualité */}
          <div className="space-y-2.5 rounded-xl border border-border p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Note du jour</span>
              {daily?.absent ? (
                <Badge className="border-red-300 bg-red-50 text-red-700">Absente</Badge>
              ) : daily?.currentlyClocked ? (
                <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700">En service</Badge>
              ) : (
                <Badge className="border-border bg-muted text-muted-foreground">Hors service</Badge>
              )}
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums">
                {daily?.note != null ? `${formatNote(daily.note)}/20` : "—"}
              </span>
              <Badge className={noteTone(daily?.note ?? null)}>
                {noteLabel(daily?.note ?? null)}
                {daily?.provisional && daily.note !== null ? " · provisoire" : ""}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg bg-muted/50 p-1.5">
                <p className="text-sm font-semibold">{daily?.salesScore != null ? formatNote(daily.salesScore) : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Ventes /20</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-1.5">
                <p className="text-sm font-semibold">{daily?.behavior ? formatNote(daily.behavior.score) : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Comportement /20</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-1.5">
                <p className="text-sm font-semibold">{p ? formatNote(p.score) : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Ponctualité /20</p>
              </div>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${daily ? Math.max(4, (daily.totalSales / maxSales) * 100) : 0}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-mono font-bold tabular-nums text-primary-strong">
                {formatFcfa(daily?.totalSales ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">
                {daily?.orderCount ?? 0} vente{(daily?.orderCount ?? 0) > 1 ? "s" : ""}
                {daily && daily.orderCount > 0 && ` · panier ${formatFcfa(daily.averageTicket)}`}
              </span>
            </div>

            <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-1">
                <Clock className="h-3 w-3" />
                {p && (
                  <span>
                    Prévu {formatTime(p.scheduledStart)}–{formatTime(p.scheduledEnd)} ·
                  </span>
                )}
                {(!daily || daily.attendance.length === 0) && <span>Pas encore pointé</span>}
                {daily?.attendance.map((a) => (
                  <span key={a.id} title={a.corrected ? `Corrigé : ${a.correctionNote}` : undefined}>
                    {formatTime(a.clockIn)}–{a.clockOut ? formatTime(a.clockOut) : "..."}
                    {a.corrected && <PencilLine className="ml-0.5 inline h-3 w-3" />}
                  </span>
                ))}
                {daily && daily.minutesWorked > 0 && <span>({formatHours(daily.minutesWorked)})</span>}
              </div>
              {p && (p.lateMinutes > 5 || p.earlyLeaveMinutes > 5) && (
                <p className="flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {p.lateMinutes > 5 && `Retard ${p.lateMinutes} min`}
                  {p.lateMinutes > 5 && p.earlyLeaveMinutes > 5 && " · "}
                  {p.earlyLeaveMinutes > 5 && `Partie ${p.earlyLeaveMinutes} min plus tôt`}
                </p>
              )}
              {daily?.behavior?.comment && <p className="italic">« {daily.behavior.comment} »</p>}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {daily?.currentlyClocked ? (
                <Button
                  size="sm"
                  variant="outline"
                  loading={clockOut.isPending}
                  onClick={() => {
                    const open = daily.attendance.find((a) => !a.clockOut);
                    if (open) clockOut.mutate(open.id);
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" /> Départ
                </Button>
              ) : (
                <Button
                  size="sm"
                  loading={clockIn.isPending}
                  disabled={!s.shiftGroup || workDate !== todayKey()}
                  title={
                    !s.shiftGroup
                      ? "Assignez d'abord une équipe (jour/soir)"
                      : workDate !== todayKey()
                        ? "Pour un autre jour, utilisez « Heures »"
                        : undefined
                  }
                  onClick={() => clockIn.mutate(s.id)}
                >
                  <LogIn className="h-3.5 w-3.5" /> Arrivée
                </Button>
              )}
              {manager && daily && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "attendance", day: daily })}>
                    <PencilLine className="h-3.5 w-3.5" /> Heures
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "behavior", day: daily })}>
                    <Star className="h-3.5 w-3.5" /> {daily.behavior ? "Comportement" : "Noter"}
                  </Button>
                </>
              )}
              {(manager || s.id === user?.id) && daily && (
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "history", day: daily })}>
                  <History className="h-3.5 w-3.5" /> Historique
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Serveuses</h1>
          <p className="text-sm text-muted-foreground">
            Équipes du matin et du soir, arrivées et départs, note du jour sur 20 : ventes ({Math.round(NOTE_WEIGHTS.sales * 100)} %),
            comportement ({Math.round(NOTE_WEIGHTS.behavior * 100)} %) et ponctualité ({Math.round(NOTE_WEIGHTS.punctuality * 100)} %).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="w-auto" />
          {can(user?.role, "manageServers") && (
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings2 className="h-4 w-4" /> Horaires
            </Button>
          )}
          {can(user?.role, "manageServers") && (
            <Button onClick={() => setShowForm(true)}>
              <UserPlus className="h-4 w-4" /> Ajouter
            </Button>
          )}
        </div>
      </div>

      {settings && (
        <p className="text-xs text-muted-foreground">
          Journée : {settings.dayStartTime}–{settings.dayEndTime} · Soirée : {settings.nightStartTime}–
          {settings.nightEndTime} (le lendemain). Les ventes/pointages avant {settings.nightEndTime} restent
          rattachés à la soirée précédente.
        </p>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sun className="h-4 w-4 text-amber-500" />
          <h2 className="font-display text-base font-semibold">Équipe du jour</h2>
          <Badge className="border-border bg-muted text-muted-foreground">{dayTeam.length}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dayTeam.map((s) => (
            <ServerCard key={s.id} s={s} />
          ))}
          {dayTeam.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Aucune serveuse dans l&apos;équipe du jour.
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Moon className="h-4 w-4 text-indigo-500" />
          <h2 className="font-display text-base font-semibold">Équipe du soir</h2>
          <Badge className="border-border bg-muted text-muted-foreground">{nightTeam.length}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {nightTeam.map((s) => (
            <ServerCard key={s.id} s={s} />
          ))}
          {nightTeam.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Aucune serveuse dans l&apos;équipe du soir.
            </p>
          )}
        </div>
      </div>

      {unassigned.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-amber-600">Équipe non assignée</h2>
            <Badge className="border-amber-300 bg-amber-50 text-amber-700">{unassigned.length}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {unassigned.map((s) => (
              <ServerCard key={s.id} s={s} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && servers.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Aucune serveuse enregistrée.</p>
      )}

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
                  shiftGroup: String(form.get("shiftGroup") || "jour"),
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
              <div>
                <Label>Équipe</Label>
                <Select name="shiftGroup" defaultValue="jour" required>
                  <option value="jour">☀️ Journée</option>
                  <option value="soir">🌙 Soirée</option>
                </Select>
              </div>
              <Button type="submit" className="w-full" loading={createServer.isPending}>
                Ajouter
              </Button>
            </form>
          </div>
        </div>
      )}

      {showSettings && settings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="mb-4 font-display text-lg font-semibold">Horaires des équipes</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                saveSettings.mutate({
                  dayStartTime: String(form.get("dayStartTime")),
                  dayEndTime: String(form.get("dayEndTime")),
                  nightStartTime: String(form.get("nightStartTime")),
                  nightEndTime: String(form.get("nightEndTime")),
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Début journée</Label>
                  <Input name="dayStartTime" type="time" defaultValue={settings.dayStartTime} required />
                </div>
                <div>
                  <Label>Fin journée</Label>
                  <Input name="dayEndTime" type="time" defaultValue={settings.dayEndTime} required />
                </div>
                <div>
                  <Label>Début soirée</Label>
                  <Input name="nightStartTime" type="time" defaultValue={settings.nightStartTime} required />
                </div>
                <div>
                  <Label>Fin soirée (aube)</Label>
                  <Input name="nightEndTime" type="time" defaultValue={settings.nightEndTime} required />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                &quot;Fin soirée&quot; est l&apos;heure de l&apos;aube : tout ce qui se passe avant cette heure
                reste compté sur la soirée précédente.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setShowSettings(false)}>
                  Annuler
                </Button>
                <Button type="submit" className="w-full" loading={saveSettings.isPending}>
                  Enregistrer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialog && targetVenueId && dialog.kind === "behavior" && (
        <BehaviorDialog venueId={targetVenueId} day={dialog.day} onClose={() => setDialog(null)} />
      )}
      {dialog && targetVenueId && dialog.kind === "attendance" && (
        <AttendanceDialog
          venueId={targetVenueId}
          day={dailyById.get(dialog.day.id) ?? dialog.day}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && targetVenueId && dialog.kind === "history" && (
        <HistoryDialog venueId={targetVenueId} server={dialog.day} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
