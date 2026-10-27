"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { can } from "@/lib/rbac";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Moon,
  SlidersHorizontal,
  Star,
  Sun,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { Dialog } from "@/components/servers/dialog";
import { ServerCard } from "@/components/servers/server-card";
import { BehaviorDialog } from "@/components/servers/behavior-dialog";
import { AttendanceDialog } from "@/components/servers/attendance-dialog";
import { HistoryDialog } from "@/components/servers/history-dialog";
import { RulesDialog } from "@/components/servers/rules-dialog";
import {
  formatDay,
  shiftDateKey,
  type MonthlyPerf,
  type ScoringRules,
  type ShiftSettings,
  type StaffDay,
  type StaffUser,
} from "@/components/servers/types";

type Team = "jour" | "soir" | "all";
type DialogState =
  { kind: "behavior" | "attendance" | "history"; userId: number } | { kind: "rules" | "hours" | "add" };

/** Équipe en service à l'heure actuelle, d'après les horaires du point de vente. */
function currentTeam(settings: ShiftSettings | undefined): "jour" | "soir" {
  if (!settings) return "jour";
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return hhmm >= settings.dayStartTime && hhmm < settings.dayEndTime ? "jour" : "soir";
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left",
        onClick && "transition-shadow hover:shadow-md active:scale-[0.99]"
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-bold leading-tight tabular-nums">{value}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
      </span>
    </Tag>
  );
}

export default function ServersPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const manager = can(user?.role, "manageServers");

  const [requestedDate, setRequestedDate] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

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
    queryKey: ["staff-performance", targetVenueId, requestedDate],
    queryFn: async () =>
      (
        await fetch(
          `/api/staff-performance?venueId=${targetVenueId}${requestedDate ? `&workDate=${requestedDate}` : ""}`
        )
      ).json(),
    enabled: !!targetVenueId,
    refetchInterval: 30000,
  });
  const dailyById = useMemo(
    () => new Map<number, StaffDay>((dailyData?.staff ?? []).map((p: StaffDay) => [p.id, p])),
    [dailyData]
  );
  const settings: ShiftSettings | undefined = dailyData?.settings;
  const rules: ScoringRules | undefined = dailyData?.rules;
  const today: string | undefined = dailyData?.today;
  const workDate: string | undefined = requestedDate ?? today;
  const isToday = !!today && workDate === today;
  const activeTeam: Team = team ?? currentTeam(settings);

  const visible = useMemo(() => {
    const list = servers.filter((s) => activeTeam === "all" || s.shiftGroup === activeTeam);
    // En service d'abord, puis par note.
    return list.sort((a, b) => {
      const da = dailyById.get(a.id);
      const db = dailyById.get(b.id);
      const clocked = Number(!!db?.currentlyClocked) - Number(!!da?.currentlyClocked);
      return clocked || (db?.note ?? -1) - (da?.note ?? -1) || a.firstName.localeCompare(b.firstName);
    });
  }, [servers, activeTeam, dailyById]);
  const unassigned = servers.filter((s) => !s.shiftGroup);
  const counts = {
    jour: servers.filter((s) => s.shiftGroup === "jour").length,
    soir: servers.filter((s) => s.shiftGroup === "soir").length,
    all: servers.length,
  };

  const visibleDays = visible.map((s) => dailyById.get(s.id)).filter((d): d is StaffDay => !!d);
  const grace = rules?.graceMinutes ?? 5;
  const inService = visibleDays.filter((d) => (isToday ? d.currentlyClocked : d.attendance.length > 0)).length;
  const lateCount = visibleDays.filter((d) => (d.punctuality?.lateMinutes ?? 0) > grace).length;
  const absentCount = visibleDays.filter((d) => d.absent).length;
  const toRate = visibleDays.filter((d) => (d.attendance.length > 0 || d.orderCount > 0) && !d.behavior);

  const bestNote = new Map<string, number>();
  for (const d of dailyById.values()) {
    if (d.note === null) continue;
    const key = d.shiftGroup ?? "";
    bestNote.set(key, Math.max(bestNote.get(key) ?? 0, d.note));
  }

  const json = async (res: Response) => {
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    return body;
  };
  const send = (url: string, method: string, payload: unknown) =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(json);

  const createServer = useMutation({
    mutationFn: (payload: Record<string, unknown>) => send("/api/users", "POST", payload),
    onSuccess: () => {
      toast.success("Serveuse ajoutée");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setShiftGroup = useMutation({
    mutationFn: ({ id, shiftGroup }: { id: number; shiftGroup: "jour" | "soir" }) =>
      send("/api/users", "PATCH", { id, shiftGroup }),
    onSuccess: (_d, v) => {
      toast.success(v.shiftGroup === "jour" ? "Passée dans l'équipe du matin" : "Passée dans l'équipe du soir");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clock = useMutation({
    mutationFn: (v: { kind: "in"; userId: number } | { kind: "out"; id: number }) =>
      v.kind === "in"
        ? send("/api/attendance", "POST", { venueId: targetVenueId, userId: v.userId })
        : send("/api/attendance", "PATCH", { id: v.id }),
    onSuccess: (_d, v) => {
      toast.success(v.kind === "in" ? "Arrivée pointée" : "Départ pointé");
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      send("/api/shift-settings", "PATCH", { venueId: targetVenueId, ...payload }),
    onSuccess: () => {
      toast.success("Horaires mis à jour");
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dialogDay = dialog && "userId" in dialog ? dailyById.get(dialog.userId) : undefined;
  const dialogServer = dialog && "userId" in dialog ? servers.find((s) => s.id === dialog.userId) : undefined;

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <PageHeader
        eyebrow="Équipe de salle"
        title="Serveuses"
        description="Présence, ponctualité, ventes et comportement : une note sur 20 chaque jour."
        actions={
          manager && (
            <>
              <Button variant="outline" size="md" className="px-3 sm:px-4" onClick={() => setDialog({ kind: "rules" })}>
                <SlidersHorizontal className="h-4 w-4" /> Règles<span className="hidden sm:inline"> de notation</span>
              </Button>
              <Button
                variant="outline"
                size="md"
                className="px-3 sm:px-4"
                onClick={() => setDialog({ kind: "hours" })}
                disabled={!settings}
              >
                <Clock className="h-4 w-4" /> Horaires
              </Button>
              <Button size="md" className="px-3 sm:px-4" onClick={() => setDialog({ kind: "add" })}>
                <UserPlus className="h-4 w-4" /> Ajouter
              </Button>
            </>
          )
        }
      />

      {/* Jour et équipe */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Jour précédent"
            disabled={!workDate}
            onClick={() => workDate && setRequestedDate(shiftDateKey(workDate, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <label className="relative flex min-w-0 flex-1 cursor-pointer flex-col items-center px-2 sm:min-w-56">
            <span className="font-display text-base font-semibold capitalize">
              {workDate ? formatDay(workDate) : "…"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {isToday ? "Aujourd'hui" : "Toucher pour choisir une date"}
            </span>
            <input
              type="date"
              value={workDate ?? ""}
              max={today}
              onChange={(e) => e.target.value && setRequestedDate(e.target.value === today ? null : e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Choisir la date"
            />
          </label>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Jour suivant"
            disabled={!workDate || isToday}
            onClick={() =>
              workDate && setRequestedDate(shiftDateKey(workDate, 1) === today ? null : shiftDateKey(workDate, 1))
            }
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          {!isToday && today && (
            <Button variant="secondary" size="sm" onClick={() => setRequestedDate(null)}>
              Aujourd&apos;hui
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 rounded-xl bg-muted p-1" role="tablist" aria-label="Équipe">
          {(
            [
              { value: "jour", label: "Matin", icon: Sun, iconTone: "text-sun" },
              { value: "soir", label: "Soir", icon: Moon, iconTone: "text-accent" },
              { value: "all", label: "Toutes", icon: Users, iconTone: "text-muted-foreground" },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={activeTeam === t.value}
              onClick={() => setTeam(t.value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                activeTeam === t.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className={cn("h-4 w-4", activeTeam === t.value && t.iconTone)} />
              {t.label}
              <span className="text-xs tabular-nums opacity-60">{counts[t.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {settings && activeTeam !== "all" && (
        <p className="-mt-2 px-1 text-xs text-muted-foreground">
          {activeTeam === "jour"
            ? `Équipe du matin : ${settings.dayStartTime} – ${settings.dayEndTime}`
            : `Équipe du soir : ${settings.nightStartTime} – ${settings.nightEndTime} (le lendemain)`}
          {rules && ` · tolérance ${rules.graceMinutes} min`}
        </p>
      )}

      {/* Résumé de l'équipe */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryTile
          icon={CalendarCheck}
          label={isToday ? "En service" : "Présentes"}
          value={`${inService}/${visible.length}`}
          tone="bg-accent/10 text-accent"
        />
        <SummaryTile icon={AlertTriangle} label="En retard" value={String(lateCount)} tone="bg-sun-soft text-sun" />
        <SummaryTile
          icon={UserX}
          label="Absentes"
          value={String(absentCount)}
          tone="bg-red-500/10 text-red-600 dark:text-red-400"
        />
        <SummaryTile
          icon={Star}
          label={manager && toRate.length ? "À noter · toucher" : "À noter"}
          value={String(toRate.length)}
          tone="bg-primary/10 text-primary-strong"
          onClick={manager && toRate.length ? () => setDialog({ kind: "behavior", userId: toRate[0].id }) : undefined}
        />
      </div>

      {unassigned.length > 0 && activeTeam !== "all" && manager && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sun/30 bg-sun-soft px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-sun" />
          <span className="text-sun">
            {unassigned.length} serveuse{unassigned.length > 1 ? "s" : ""} sans équipe :
          </span>
          {unassigned.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-1 text-xs">
              {s.firstName}
              <button
                className="rounded-full px-1.5 hover:bg-muted"
                onClick={() => setShiftGroup.mutate({ id: s.id, shiftGroup: "jour" })}
              >
                ☀️ Matin
              </button>
              <button
                className="rounded-full px-1.5 hover:bg-muted"
                onClick={() => setShiftGroup.mutate({ id: s.id, shiftGroup: "soir" })}
              >
                🌙 Soir
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 pt-1 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((s) => {
          const day = dailyById.get(s.id);
          return (
            <ServerCard
              key={s.id}
              server={s}
              day={day}
              rules={rules}
              isTop={!!day && day.note !== null && day.note === bestNote.get(day.shiftGroup ?? "")}
              isToday={isToday}
              manager={manager}
              canSeeHistory={manager || s.id === user?.id}
              clockPending={
                clock.isPending &&
                (clock.variables?.kind === "in"
                  ? clock.variables.userId === s.id
                  : (day?.attendance.some((a) => clock.variables?.kind === "out" && a.id === clock.variables.id) ??
                    false))
              }
              onClockIn={() => clock.mutate({ kind: "in", userId: s.id })}
              onClockOut={(id) => clock.mutate({ kind: "out", id })}
              onOpen={(kind) => setDialog({ kind, userId: s.id })}
              onSetShift={(shiftGroup) => setShiftGroup.mutate({ id: s.id, shiftGroup })}
            />
          );
        })}
      </div>

      {!isLoading && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {servers.length === 0 ? "Aucune serveuse enregistrée." : "Personne dans cette équipe."}
          </p>
          {manager && servers.length === 0 && (
            <Button className="mt-4" onClick={() => setDialog({ kind: "add" })}>
              <UserPlus className="h-4 w-4" /> Ajouter une serveuse
            </Button>
          )}
        </div>
      )}

      {/* Fenêtres */}
      {dialog?.kind === "behavior" && dialogDay && rules && targetVenueId && (
        <BehaviorDialog venueId={targetVenueId} day={dialogDay} rules={rules} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "attendance" && dialogDay && targetVenueId && (
        <AttendanceDialog venueId={targetVenueId} day={dialogDay} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "history" && dialogServer && targetVenueId && (
        <HistoryDialog
          venueId={targetVenueId}
          server={dialogServer}
          monthly={monthlyById.get(dialogServer.id)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rules" && targetVenueId && (
        <RulesDialog venueId={targetVenueId} onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === "add" && (
        <Dialog
          title="Nouvelle serveuse"
          subtitle="Elle pourra se connecter avec cet email."
          onClose={() => setDialog(null)}
        >
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
                venueIds: targetVenueId ? [targetVenueId] : [],
              });
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prénom</Label>
                <Input name="firstName" required autoFocus />
              </div>
              <div>
                <Label>Nom</Label>
                <Input name="lastName" required />
              </div>
            </div>
            <div>
              <Label>Équipe</Label>
              <Select name="shiftGroup" defaultValue={activeTeam === "soir" ? "soir" : "jour"} required>
                <option value="jour">☀️ Équipe du matin</option>
                <option value="soir">🌙 Équipe du soir</option>
              </Select>
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input name="phone" type="tel" inputMode="tel" />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" required />
            </div>
            <div>
              <Label>Mot de passe (6 caractères au moins)</Label>
              <Input name="password" type="password" minLength={6} required />
            </div>
            <Button type="submit" className="w-full" loading={createServer.isPending}>
              Ajouter
            </Button>
          </form>
        </Dialog>
      )}

      {dialog?.kind === "hours" && settings && (
        <Dialog
          title="Horaires des équipes"
          subtitle="Servent à mesurer les retards et les départs anticipés."
          onClose={() => setDialog(null)}
        >
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
            className="space-y-4"
          >
            <fieldset className="space-y-2 rounded-2xl border border-border p-3">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <Sun className="h-4 w-4 text-sun" /> Équipe du matin
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Arrivée</Label>
                  <Input name="dayStartTime" type="time" defaultValue={settings.dayStartTime} required />
                </div>
                <div>
                  <Label>Départ</Label>
                  <Input name="dayEndTime" type="time" defaultValue={settings.dayEndTime} required />
                </div>
              </div>
            </fieldset>
            <fieldset className="space-y-2 rounded-2xl border border-border p-3">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <Moon className="h-4 w-4 text-accent" /> Équipe du soir
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Arrivée</Label>
                  <Input name="nightStartTime" type="time" defaultValue={settings.nightStartTime} required />
                </div>
                <div>
                  <Label>Départ (fin de nuit)</Label>
                  <Input name="nightEndTime" type="time" defaultValue={settings.nightEndTime} required />
                </div>
              </div>
            </fieldset>
            <p className="text-xs text-muted-foreground">
              Ce qui se passe avant l&apos;heure de fin de nuit compte encore pour la soirée de la veille.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="w-full" onClick={() => setDialog(null)}>
                Annuler
              </Button>
              <Button type="submit" className="w-full" loading={saveSettings.isPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
