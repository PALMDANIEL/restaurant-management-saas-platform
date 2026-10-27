"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { Dialog } from "./dialog";
import { formatTime, toLocalInput, type StaffDay } from "./types";

function toIso(local: FormDataEntryValue | null) {
  const v = String(local || "");
  return v ? new Date(v).toISOString() : null;
}

/** Correction des heures d'arrivée et de départ par un responsable (motif obligatoire, tracé). */
export function AttendanceDialog({ venueId, day, onClose }: { venueId: number; day: StaffDay; onClose: () => void }) {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: async ({ method, payload }: { method: "POST" | "PATCH"; payload: Record<string, unknown> }) => {
      const res = await fetch("/api/attendance", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (_d, v) => {
      toast.success(v.method === "POST" ? "Pointage ajouté" : "Heures corrigées");
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
      queryClient.invalidateQueries({ queryKey: ["staff-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defaultStart = day.punctuality?.scheduledStart ?? `${day.workDate}T08:00:00`;

  return (
    <Dialog
      title={`Heures — ${day.firstName} ${day.lastName}`}
      subtitle="Toute correction est enregistrée dans le journal d'audit."
      onClose={onClose}
    >
      <div className="space-y-4">
        {day.attendance.map((a) => (
          <form
            key={a.id}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              send.mutate({
                method: "PATCH",
                payload: {
                  id: a.id,
                  clockIn: toIso(form.get("clockIn")),
                  clockOut: toIso(form.get("clockOut")),
                  correctionNote: String(form.get("note") || "").trim() || undefined,
                },
              });
            }}
            className="space-y-2 rounded-xl border border-border p-3"
          >
            <p className="text-xs text-muted-foreground">
              Pointage {formatTime(a.clockIn)}–{a.clockOut ? formatTime(a.clockOut) : "en cours"}
              {a.corrected && ` · déjà corrigé (${a.correctionNote})`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Arrivée</Label>
                <Input name="clockIn" type="datetime-local" defaultValue={toLocalInput(a.clockIn)} required />
              </div>
              <div>
                <Label>Départ</Label>
                <Input
                  name="clockOut"
                  type="datetime-local"
                  defaultValue={a.clockOut ? toLocalInput(a.clockOut) : ""}
                />
              </div>
            </div>
            <Input name="note" placeholder="Motif (ex : a oublié de pointer son départ)" required />
            <Button type="submit" size="sm" loading={send.isPending}>
              Corriger
            </Button>
          </form>
        ))}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            send.mutate({
              method: "POST",
              payload: {
                venueId,
                userId: day.id,
                clockIn: toIso(form.get("clockIn")),
                clockOut: toIso(form.get("clockOut")) ?? undefined,
                correctionNote: String(form.get("note") || "").trim() || undefined,
              },
            });
          }}
          className="space-y-2 rounded-xl border border-dashed border-border p-3"
        >
          <p className="text-sm font-medium">Ajouter un pointage oublié</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Arrivée</Label>
              <Input name="clockIn" type="datetime-local" defaultValue={toLocalInput(defaultStart)} required />
            </div>
            <div>
              <Label>Départ</Label>
              <Input name="clockOut" type="datetime-local" />
            </div>
          </div>
          <Input name="note" placeholder="Motif (ex : arrivée signalée au gérant)" required />
          <Button type="submit" size="sm" variant="outline" loading={send.isPending}>
            Ajouter
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
