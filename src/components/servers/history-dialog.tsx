"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Dialog } from "./dialog";
import { formatFcfa, formatHours, formatNote, formatTime, noteTone, type StaffDay } from "./types";

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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-2.5 text-center">
      <p className="text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

const note20 = (n: number | null) => (n === null ? "—" : `${formatNote(n)}/20`);

/** Historique jour par jour d'une serveuse : présence, heures, ventes, comportement, note. */
export function HistoryDialog({
  venueId,
  server,
  onClose,
}: {
  venueId: number;
  server: { id: number; firstName: string; lastName: string };
  onClose: () => void;
}) {
  const [days, setDays] = useState("30");
  const { data, isLoading } = useQuery({
    queryKey: ["staff-history", venueId, server.id, days],
    queryFn: async () =>
      (await fetch(`/api/staff-performance/history?venueId=${venueId}&userId=${server.id}&days=${days}`)).json(),
  });
  const summary: Summary | undefined = data?.summary;
  const rows: Omit<StaffDay, "id" | "firstName" | "lastName">[] = data?.days ?? [];

  return (
    <Dialog title={`Historique — ${server.firstName} ${server.lastName}`} onClose={onClose} wide>
      <div className="space-y-4">
        <Select value={days} onChange={(e) => setDays(e.target.value)} className="w-auto">
          <option value="7">7 derniers jours</option>
          <option value="30">30 derniers jours</option>
          <option value="92">3 derniers mois</option>
        </Select>

        {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}

        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Note moyenne" value={note20(summary.averageNote)} />
            <Tile label="Comportement moyen" value={note20(summary.averageBehavior)} />
            <Tile label="Ponctualité moyenne" value={note20(summary.averagePunctuality)} />
            <Tile label="Ventes" value={`${summary.orderCount} · ${formatFcfa(summary.totalSales)}`} />
            <Tile label="Jours travaillés" value={String(summary.daysWorked)} />
            <Tile label="Absences" value={String(summary.daysAbsent)} />
            <Tile label="Jours en retard" value={`${summary.daysLate} (${summary.totalLateMinutes} min)`} />
            <Tile label="Heures travaillées" value={formatHours(summary.minutesWorked)} />
          </div>
        )}

        <div className="space-y-1.5">
          {rows.map((d) => {
            const worked = d.attendance.length > 0 || d.orderCount > 0;
            if (!worked && !d.absent && !d.behavior) return null;
            const first = d.attendance[0];
            const last = d.attendance[d.attendance.length - 1];
            return (
              <div key={d.workDate} className="rounded-xl border border-border p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize">
                    {new Date(`${d.workDate}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    {d.shiftGroup && <span className="ml-1 text-muted-foreground">{d.shiftGroup === "jour" ? "☀️" : "🌙"}</span>}
                  </span>
                  {d.absent ? (
                    <Badge className="border-red-300 bg-red-50 text-red-700">Absente</Badge>
                  ) : (
                    <Badge className={noteTone(d.note)}>
                      {note20(d.note)}
                      {d.provisional && d.note !== null ? " (provisoire)" : ""}
                    </Badge>
                  )}
                </div>
                {worked && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                    <span>
                      {first ? formatTime(first.clockIn) : "—"} → {last?.clockOut ? formatTime(last.clockOut) : "—"}
                      {d.attendance.some((a) => a.corrected) && " (corrigé)"}
                    </span>
                    {d.punctuality && d.punctuality.lateMinutes > 5 && (
                      <span className="text-amber-700">retard {d.punctuality.lateMinutes} min</span>
                    )}
                    {d.punctuality && d.punctuality.earlyLeaveMinutes > 5 && (
                      <span className="text-amber-700">partie {d.punctuality.earlyLeaveMinutes} min plus tôt</span>
                    )}
                    <span>
                      {d.orderCount} vente{d.orderCount > 1 ? "s" : ""} · {formatFcfa(d.totalSales)}
                    </span>
                    <span>Comportement {d.behavior ? `${formatNote(d.behavior.score)}/20` : "non noté"}</span>
                  </div>
                )}
                {d.behavior?.comment && <p className="mt-1 italic text-muted-foreground">« {d.behavior.comment} »</p>}
              </div>
            );
          })}
          {!isLoading && rows.every((d) => !(d.attendance.length > 0 || d.orderCount > 0 || d.absent || d.behavior)) && (
            <p className="py-6 text-center text-sm text-muted-foreground">Rien sur cette période.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
