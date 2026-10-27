"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarDays,
  History,
  LogIn,
  LogOut,
  Moon,
  MoreHorizontal,
  PencilLine,
  ShoppingBag,
  Star,
  Sun,
  Trophy,
} from "lucide-react";
import { NoteRing } from "./note-ring";
import {
  PART_STYLE,
  formatFcfa,
  formatHours,
  formatNote,
  formatTime,
  noteLabel,
  noteTone,
  type ScoringRules,
  type StaffDay,
  type StaffUser,
} from "./types";

type DialogKind = "behavior" | "attendance" | "history";

function PartBar({ part, value, weight }: { part: keyof typeof PART_STYLE; value: number | null; weight: number }) {
  const s = PART_STYLE[part];
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">
          {s.label} <span className="opacity-70">· {weight} %</span>
        </span>
        <span className={cn("font-semibold tabular-nums", value === null ? "text-muted-foreground" : s.text)}>
          {value === null ? "—" : formatNote(value)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", s.bar)}
          style={{ width: `${((value ?? 0) / 20) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Status({ day, isToday }: { day: StaffDay | undefined; isToday: boolean }) {
  if (day?.currentlyClocked && !isToday) return <span className="text-sun">Départ non pointé</span>;
  if (day?.currentlyClocked) return <span className="text-accent">En service</span>;
  if (day?.absent) return <span className="text-red-600 dark:text-red-400">Absente</span>;
  if (day && day.attendance.length > 0) return <span className="text-muted-foreground">Service terminé</span>;
  return <span className="text-muted-foreground">Pas encore arrivée</span>;
}

export function ServerCard({
  server,
  day,
  rules,
  isTop,
  isToday,
  manager,
  canSeeHistory,
  clockPending,
  onClockIn,
  onClockOut,
  onOpen,
  onSetShift,
}: {
  server: StaffUser;
  day: StaffDay | undefined;
  rules: ScoringRules | undefined;
  isTop: boolean;
  isToday: boolean;
  manager: boolean;
  canSeeHistory: boolean;
  clockPending: boolean;
  onClockIn: () => void;
  onClockOut: (attendanceId: number) => void;
  onOpen: (kind: DialogKind) => void;
  onSetShift: (group: "jour" | "soir") => void;
}) {
  const [menu, setMenu] = useState(false);
  const p = day?.punctuality;
  const present = !!day && (day.attendance.length > 0 || day.orderCount > 0);
  const tone = noteTone(day?.note ?? null);
  const first = day?.attendance[0];
  const last = day?.attendance[day.attendance.length - 1];
  const late = p && p.lateMinutes > (rules?.graceMinutes ?? 5);
  const early = p && p.earlyLeaveMinutes > (rules?.graceMinutes ?? 5);
  const open = day?.attendance.find((a) => !a.clockOut);

  // Action principale : celle qu'on attend à ce moment de la journée.
  let primary: React.ReactNode = null;
  if (open && !isToday) {
    // Journée passée sans départ pointé : pointer maintenant enregistrerait une heure fausse.
    primary = manager ? (
      <Button variant="outline" className="w-full border-sun/40 text-sun" onClick={() => onOpen("attendance")}>
        <CalendarDays className="h-4 w-4" /> Saisir l&apos;heure de départ
      </Button>
    ) : null;
  } else if (open) {
    primary = (
      <Button variant="outline" className="w-full" loading={clockPending} onClick={() => onClockOut(open.id)}>
        <LogOut className="h-4 w-4" /> Pointer le départ
      </Button>
    );
  } else if (isToday && !day?.attendance.length && server.shiftGroup) {
    primary = (
      <Button className="w-full" loading={clockPending} onClick={onClockIn}>
        <LogIn className="h-4 w-4" /> Pointer l&apos;arrivée
      </Button>
    );
  } else if (manager && present && !day?.behavior) {
    primary = (
      <Button variant="accent" className="w-full" onClick={() => onOpen("behavior")}>
        <Star className="h-4 w-4" /> Noter le comportement
      </Button>
    );
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(28,23,18,0.04)] transition-shadow hover:shadow-md",
        isTop ? "border-sun/50 ring-1 ring-sun/20" : "border-border"
      )}
    >
      {isTop && (
        <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-sun px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
          <Trophy className="h-3 w-3" /> Meilleure note
        </span>
      )}

      <header className="flex items-start gap-3">
        <div className="relative">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-semibold text-primary-strong">
            {initials(server.firstName, server.lastName)}
          </div>
          <span
            className={cn(
              "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card",
              day?.currentlyClocked ? (isToday ? "bg-accent" : "bg-sun") : day?.absent ? "bg-red-500" : "bg-border"
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[15px] font-semibold">
            {server.firstName} {server.lastName}
          </h3>
          <p className="text-xs font-medium">
            <Status day={day} isToday={isToday} />
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {p
              ? `Prévu ${formatTime(p.scheduledStart)} – ${formatTime(p.scheduledEnd)}`
              : server.phone || server.matricule || " "}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <NoteRing note={day?.note ?? null} provisional={day?.provisional} />
          <span className={cn("text-[10px] font-medium", tone.text)}>
            {day?.note != null ? (day.provisional ? "Provisoire" : noteLabel(day.note)) : present ? "—" : " "}
          </span>
        </div>
      </header>

      {/* Horaires réels */}
      {present && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/50 px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1">
            <LogIn className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold tabular-nums">{first ? formatTime(first.clockIn) : "—"}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold tabular-nums">
              {last?.clockOut ? formatTime(last.clockOut) : day?.currentlyClocked ? "en cours" : "—"}
            </span>
          </span>
          {day && day.minutesWorked > 0 && (
            <span className="text-muted-foreground">{formatHours(day.minutesWorked)}</span>
          )}
          {day?.attendance.some((a) => a.corrected) && (
            <span
              className="inline-flex items-center gap-1 text-muted-foreground"
              title={day.attendance.find((a) => a.corrected)?.correctionNote ?? ""}
            >
              <PencilLine className="h-3 w-3" /> corrigé
            </span>
          )}
          {(late || early) && (
            <span className="inline-flex items-center gap-1 font-medium text-sun">
              <AlertTriangle className="h-3.5 w-3.5" />
              {late && `+${p!.lateMinutes} min`}
              {late && early && " · "}
              {early && `parti ${p!.earlyLeaveMinutes} min tôt`}
            </span>
          )}
        </div>
      )}

      {/* Détail de la note */}
      {present && rules && (
        <div className="mt-3 space-y-2">
          <PartBar part="sales" value={day?.salesScore ?? null} weight={rules.weights.sales} />
          <PartBar part="behavior" value={day?.behavior?.score ?? null} weight={rules.weights.behavior} />
          <PartBar part="punctuality" value={p?.score ?? null} weight={rules.weights.punctuality} />
        </div>
      )}

      {present && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShoppingBag className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground">{day!.orderCount}</span> vente{day!.orderCount > 1 ? "s" : ""}{" "}
          ·<span className="font-mono font-semibold text-foreground">{formatFcfa(day!.totalSales)}</span>
        </p>
      )}
      {day?.behavior?.comment && (
        <p className="mt-2 line-clamp-2 border-l-2 border-accent/40 pl-2 text-xs italic text-muted-foreground">
          {day.behavior.comment}
        </p>
      )}
      {!present && !server.shiftGroup && (
        <p className="mt-3 rounded-xl bg-sun-soft px-3 py-2 text-xs text-sun">
          Choisissez son équipe pour pouvoir pointer.
        </p>
      )}

      <footer className="mt-auto space-y-2 pt-4">
        {primary}
        <div className="flex items-center gap-2">
          {manager && present && day?.behavior && (
            <Button variant="outline" size="sm" className="flex-1 whitespace-nowrap" onClick={() => onOpen("behavior")}>
              <Star className="h-3.5 w-3.5" /> Comportement
            </Button>
          )}
          {canSeeHistory && (
            <Button variant="ghost" size="sm" className="flex-1 whitespace-nowrap" onClick={() => onOpen("history")}>
              <History className="h-3.5 w-3.5" /> Historique
            </Button>
          )}
          {manager && (
            <div className="relative">
              <Button variant="ghost" size="sm" aria-label="Plus d'actions" onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute bottom-10 right-0 z-20 w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setMenu(false);
                        onOpen("attendance");
                      }}
                    >
                      <CalendarDays className="h-4 w-4 text-muted-foreground" /> Corriger les heures
                    </button>
                    {present && !day?.behavior && (
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setMenu(false);
                          onOpen("behavior");
                        }}
                      >
                        <Star className="h-4 w-4 text-muted-foreground" /> Noter le comportement
                      </button>
                    )}
                    <div className="my-1 border-t border-border" />
                    <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Équipe
                    </p>
                    {(["jour", "soir"] as const).map((g) => (
                      <button
                        key={g}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                          server.shiftGroup === g && "font-semibold text-primary-strong"
                        )}
                        onClick={() => {
                          setMenu(false);
                          if (server.shiftGroup !== g) onSetShift(g);
                        }}
                      >
                        {g === "jour" ? <Sun className="h-4 w-4 text-sun" /> : <Moon className="h-4 w-4 text-accent" />}
                        {g === "jour" ? "Équipe du matin" : "Équipe du soir"}
                        {server.shiftGroup === g && <span className="ml-auto text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}
