"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { behaviorScore } from "@/lib/staff-scoring-rules";
import { Dialog } from "./dialog";
import { STAR_WORDS, formatDay, formatNote, noteTone, type ScoringRules, type StaffDay } from "./types";

/** Fiche de comportement du jour : chaque critère actif noté de 1 à 5 étoiles, et un commentaire. */
export function BehaviorDialog({
  venueId,
  day,
  rules,
  onClose,
}: {
  venueId: number;
  day: StaffDay;
  rules: ScoringRules;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const criteria = rules.criteria.filter((c) => c.active);
  const [scores, setScores] = useState<Record<string, number>>(day.behavior?.scores ?? {});
  const [comment, setComment] = useState(day.behavior?.comment ?? "");
  const remaining = criteria.filter((c) => !scores[c.key]).length;
  const preview = remaining === 0 ? behaviorScore(rules, scores) : null;
  const tone = noteTone(preview);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
    queryClient.invalidateQueries({ queryKey: ["staff-history"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff-ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          userId: day.id,
          workDate: day.workDate,
          scores,
          comment: comment || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Comportement de ${day.firstName} enregistré`);
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
    <Dialog title={`Comportement de ${day.firstName}`} subtitle={formatDay(day.workDate)} onClose={onClose}>
      <div className="space-y-2.5">
        {criteria.map((c) => {
          const value = scores[c.key] ?? 0;
          return (
            <div
              key={c.key}
              className={cn(
                "rounded-2xl border px-3 py-2.5 transition-colors sm:flex sm:items-center sm:gap-3",
                value ? "border-border" : "border-dashed border-border"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <p className="text-sm font-medium">{c.label}</p>
                  <span className={cn("text-xs font-medium sm:hidden", value ? "text-sun" : "text-muted-foreground")}>
                    {value ? STAR_WORDS[value] : "À noter"}
                  </span>
                </div>
                {c.hint && <p className="text-[11px] leading-snug text-muted-foreground">{c.hint}</p>}
              </div>
              <div className="mt-1.5 flex shrink-0 flex-col items-end sm:mt-0">
                <div
                  className="flex w-full justify-between sm:w-auto sm:justify-start"
                  role="radiogroup"
                  aria-label={c.label}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={value === n}
                      aria-label={`${n} sur 5 — ${STAR_WORDS[n]}`}
                      onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                      className="rounded-xl p-1.5 transition-transform hover:bg-muted active:scale-90 sm:p-1"
                    >
                      <Star className={cn("h-8 w-8 sm:h-6 sm:w-6", value >= n ? "fill-sun text-sun" : "text-border")} />
                    </button>
                  ))}
                </div>
                <span
                  className={cn(
                    "hidden pr-1 text-[11px] font-medium sm:block",
                    value ? "text-sun" : "text-muted-foreground"
                  )}
                >
                  {value ? STAR_WORDS[value] : "À noter"}
                </span>
              </div>
            </div>
          );
        })}

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Commentaire : faits observés, félicitations, points à améliorer…"
        />

        <div className="sticky -bottom-6 -mx-6 -mb-6 space-y-3 border-t border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Note de comportement</span>
            {preview === null ? (
              <span className="text-sm text-muted-foreground">
                encore {remaining} critère{remaining > 1 ? "s" : ""}
              </span>
            ) : (
              <span className={cn("font-display text-xl font-bold tabular-nums", tone.text)}>
                {formatNote(preview)}/20
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {day.behavior && (
              <Button type="button" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
                Supprimer
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="ml-auto">
              Annuler
            </Button>
            <Button type="button" disabled={remaining > 0} loading={save.isPending} onClick={() => save.mutate()}>
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
