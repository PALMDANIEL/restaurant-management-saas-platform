"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AlertTriangle, PencilLine, Star } from "lucide-react";
import { Dialog } from "./dialog";
import {
  formatDay,
  formatFcfa,
  formatHours,
  formatNote,
  formatTime,
  noteTone,
  type MonthlyPerf,
  type ScoringRules,
  type StaffDay,
} from "./types";

type Summary = {
  daysWorked: number;
  daysAbsent: number;
  daysLate: number;
  totalLateMinutes: number;
  orderCount: number;
  totalSales: number;
  minutesWorked: number;
  averageNote: number | null;
  averageBehavior: number | null;
  averagePunctuality: number | null;
};
type Day = Omit<StaffDay, "id" | "firstName" | "lastName">;

const PERIODS = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "92", label: "3 mois" },
];

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className={cn("font-display text-lg font-bold tabular-nums", tone)}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

const note20 = (n: number | null) => (n === null ? "—" : `${formatNote(n)}/20`);

/** Courbe des notes jour par jour (les jours sans note laissent un trou). */
function Trend({ days }: { days: Day[] }) {
  const points = [...days].reverse();
  if (points.filter((d) => d.note !== null).length < 2) return null;
  const w = 600;
  const h = 90;
  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 8) + 4);
  const y = (n: number) => h - 6 - (n / 20) * (h - 12);
  const segments: string[] = [];
  let current = "";
  points.forEach((d, i) => {
    if (d.note === null) {
      if (current) segments.push(current);
      current = "";
    } else current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(d.note).toFixed(1)}`;
  });
  if (current) segments.push(current);
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="mb-1 text-[11px] text-muted-foreground">Évolution de la note</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
        {[10, 14].map((n) => (
          <line
            key={n}
            x1="0"
            x2={w}
            y1={y(n)}
            y2={y(n)}
            className="stroke-border"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            className="stroke-primary"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
        {points.map((d, i) =>
          d.note === null ? null : (
            <circle
              key={d.workDate}
              cx={x(i)}
              cy={y(d.note)}
              r="3"
              className={cn("fill-card", noteTone(d.note).ring)}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )
        )}
      </svg>
    </div>
  );
}

/** Historique jour par jour d'une serveuse : présence, heures, ventes, comportement, note. */
export function HistoryDialog({
  venueId,
  server,
  monthly,
  onClose,
}: {
  venueId: number;
  server: { id: number; firstName: string; lastName: string };
  monthly?: MonthlyPerf;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState("30");
  const { data, isLoading } = useQuery({
    queryKey: ["staff-history", venueId, server.id, period],
    queryFn: async () =>
      (await fetch(`/api/staff-performance/history?venueId=${venueId}&userId=${server.id}&days=${period}`)).json(),
  });
  const summary: Summary | undefined = data?.summary;
  const rules: ScoringRules | undefined = data?.rules;
  const rows: Day[] = (data?.days ?? []).filter(
    (d: Day) => d.attendance.length > 0 || d.orderCount > 0 || d.absent || d.behavior
  );
  const criterionLabel = (key: string) => rules?.criteria.find((c) => c.key === key)?.label ?? key;
  // Critères dans l'ordre des règles, puis ceux qui n'y figurent plus.
  const orderedScores = (scores: Record<string, number>) => {
    const order = rules?.criteria.map((c) => c.key) ?? [];
    return Object.entries(scores).sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  };

  return (
    <Dialog title={`${server.firstName} ${server.lastName}`} subtitle="Historique et bilan" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="inline-flex rounded-xl bg-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                period === p.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>}

        {summary && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile
                label="Note moyenne"
                value={note20(summary.averageNote)}
                tone={noteTone(summary.averageNote).text}
              />
              <Tile label="Comportement" value={note20(summary.averageBehavior)} tone="text-accent" />
              <Tile label="Ponctualité" value={note20(summary.averagePunctuality)} tone="text-sun" />
              <Tile label={`${summary.orderCount} ventes`} value={formatFcfa(summary.totalSales)} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Jours travaillés" value={String(summary.daysWorked)} />
              <Tile label="Heures" value={formatHours(summary.minutesWorked)} />
              <Tile
                label={`Retards (${summary.totalLateMinutes} min)`}
                value={String(summary.daysLate)}
                tone={summary.daysLate ? "text-sun" : undefined}
              />
              <Tile
                label="Absences"
                value={String(summary.daysAbsent)}
                tone={summary.daysAbsent ? "text-red-600 dark:text-red-400" : undefined}
              />
            </div>
            {monthly && (
              <p className="text-xs text-muted-foreground">
                Ce mois-ci : {monthly.completedOrders} commandes servies, {monthly.cancelledOrders} annulées
                {monthly.avgServiceMinutes !== null && `, ${monthly.avgServiceMinutes} min en moyenne pour servir`}.
              </p>
            )}
            <Trend days={data.days} />
          </>
        )}

        <div className="divide-y divide-border rounded-2xl border border-border">
          {rows.map((d) => {
            const first = d.attendance[0];
            const last = d.attendance[d.attendance.length - 1];
            const p = d.punctuality;
            const grace = rules?.graceMinutes ?? 5;
            return (
              <div key={d.workDate} className="flex gap-3 p-3">
                <div className="w-12 shrink-0 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {formatDay(d.workDate, { weekday: "short" })}
                  </p>
                  <p className="font-display text-lg font-bold leading-tight">
                    {formatDay(d.workDate, { day: "numeric" })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatDay(d.workDate, { month: "short" })}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  {d.absent ? (
                    <p className="font-medium text-red-600 dark:text-red-400">
                      Absente {d.shiftGroup === "soir" ? "(équipe du soir)" : "(équipe du matin)"}
                    </p>
                  ) : (
                    <>
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold tabular-nums">
                          {first ? formatTime(first.clockIn) : "—"} → {last?.clockOut ? formatTime(last.clockOut) : "—"}
                        </span>
                        {d.attendance.some((a) => a.corrected) && (
                          <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                            <PencilLine className="h-3 w-3" /> corrigé
                          </span>
                        )}
                        {p && p.lateMinutes > grace && (
                          <span className="inline-flex items-center gap-0.5 text-sun">
                            <AlertTriangle className="h-3 w-3" /> +{p.lateMinutes} min
                          </span>
                        )}
                        {p && p.earlyLeaveMinutes > grace && (
                          <span className="text-sun">parti {p.earlyLeaveMinutes} min tôt</span>
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        {d.orderCount} vente{d.orderCount > 1 ? "s" : ""} · {formatFcfa(d.totalSales)}
                      </p>
                    </>
                  )}
                  {d.behavior ? (
                    <p className="flex flex-wrap gap-x-2 text-muted-foreground">
                      {orderedScores(d.behavior.scores).map(([k, v]) => (
                        <span key={k} className="inline-flex items-center gap-0.5">
                          {criterionLabel(k)} <Star className="h-3 w-3 fill-sun text-sun" />
                          {v}
                        </span>
                      ))}
                    </p>
                  ) : (
                    !d.absent && <p className="text-muted-foreground/70">Comportement non noté</p>
                  )}
                  {d.behavior?.comment && <p className="italic text-muted-foreground">« {d.behavior.comment} »</p>}
                </div>
                <div className="shrink-0 text-right">
                  {!d.absent && (
                    <span
                      className={cn(
                        "inline-block rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
                        noteTone(d.note).chip
                      )}
                    >
                      {note20(d.note)}
                    </span>
                  )}
                  {d.provisional && d.note !== null && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">provisoire</p>
                  )}
                </div>
              </div>
            );
          })}
          {!isLoading && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Rien sur cette période.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
