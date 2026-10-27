"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Dialog } from "./dialog";
import { BEHAVIOR_LABELS, formatNote, type BehaviorScores, type StaffDay } from "./types";

/** Fiche de comportement du jour : 5 critères notés de 1 à 5 étoiles, et un commentaire. */
export function BehaviorDialog({ venueId, day, onClose }: { venueId: number; day: StaffDay; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Partial<BehaviorScores>>(day.behavior ?? {});
  const [comment, setComment] = useState(day.behavior?.comment ?? "");
  const complete = BEHAVIOR_LABELS.every((c) => scores[c.key]);
  const preview = complete
    ? (BEHAVIOR_LABELS.reduce((sum, c) => sum + scores[c.key]!, 0) / BEHAVIOR_LABELS.length / 5) * 20
    : null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
    queryClient.invalidateQueries({ queryKey: ["staff-history"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff-ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, userId: day.id, workDate: day.workDate, ...scores, comment: comment || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Fiche de comportement enregistrée");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/staff-ratings?id=${day.behavior!.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Fiche supprimée");
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      title={`Comportement — ${day.firstName} ${day.lastName}`}
      subtitle={`Journée du ${new Date(`${day.workDate}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {BEHAVIOR_LABELS.map((c) => (
          <div key={c.key} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">{c.hint}</p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} sur 5`}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                    className="p-0.5"
                  >
                    <Star
                      className={`h-5 w-5 ${
                        (scores[c.key] ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div>
          <Label>Commentaire (faits observés, félicitations, remarques)</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} />
        </div>

        <p className="text-sm">
          Note de comportement :{" "}
          <span className="font-semibold">{preview === null ? "notez les 5 critères" : `${formatNote(Math.round(preview * 10) / 10)}/20`}</span>
        </p>

        <div className="flex gap-2">
          {day.behavior && (
            <Button type="button" variant="outline" loading={remove.isPending} onClick={() => remove.mutate()}>
              Supprimer
            </Button>
          )}
          <Button type="button" className="flex-1" disabled={!complete} loading={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
