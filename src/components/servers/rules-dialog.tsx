"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { criterionKey, punctualityScore, scoringRulesSchema } from "@/lib/staff-scoring-rules";
import { Dialog } from "./dialog";
import { PART_STYLE, formatDay, type ScoringRules } from "./types";

type Part = keyof ScoringRules["weights"];
const PARTS: Part[] = ["sales", "behavior", "punctuality"];
const SLIDER_COLOR: Record<Part, string> = {
  sales: "var(--primary)",
  behavior: "var(--accent)",
  punctuality: "var(--sun)",
};

/** Change une part et répartit le reste entre les deux autres, pour garder 100 % au total. */
function rebalance(weights: ScoringRules["weights"], part: Part, value: number): ScoringRules["weights"] {
  const others = PARTS.filter((p) => p !== part);
  const rest = 100 - value;
  const currentOthers = weights[others[0]] + weights[others[1]];
  // Arrondi à 5 % pour des parts faciles à lire.
  const raw = currentOthers === 0 ? rest / 2 : (weights[others[0]] / currentOthers) * rest;
  const first = Math.min(rest, Math.round(raw / 5) * 5);
  return { ...weights, [part]: value, [others[0]]: first, [others[1]]: rest - first } as ScoringRules["weights"];
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <div>
        <h4 className="font-display text-sm font-semibold">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center overflow-hidden rounded-xl border border-border">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => set(value - 1)}
          className="h-9 w-9 text-lg hover:bg-muted disabled:opacity-40"
        >
          −
        </button>
        <span className="w-20 text-center text-sm font-semibold tabular-nums">
          {value} {suffix}
        </span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => set(value + 1)}
          className="h-9 w-9 text-lg hover:bg-muted disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function RulesEditor({
  venueId,
  initial,
  defaults,
  canEdit,
  today,
  changes,
  onClose,
}: {
  venueId: number;
  initial: ScoringRules;
  defaults: ScoringRules;
  canEdit: boolean;
  today: string;
  changes: { effectiveFrom: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<ScoringRules>(initial);
  // Critères déjà enregistrés : on peut les désactiver mais pas les effacer (l'historique s'y réfère).
  const savedKeys = initial.criteria.map((c) => c.key);
  const [exampleLate, setExampleLate] = useState(17);

  const validation = scoringRulesSchema.safeParse(rules);
  const error = validation.success ? null : validation.error.issues[0]?.message;
  const changed = JSON.stringify(rules) !== JSON.stringify(initial);
  const example = punctualityScore(rules, exampleLate, 0);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff-scoring-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, rules }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Règles enregistrées, appliquées dès aujourd'hui");
      queryClient.invalidateQueries({ queryKey: ["staff-scoring-rules"] });
      queryClient.invalidateQueries({ queryKey: ["staff-performance"] });
      queryClient.invalidateQueries({ queryKey: ["staff-history"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCriterion = (i: number, patch: Partial<ScoringRules["criteria"][number]>) =>
    setRules((r) => ({ ...r, criteria: r.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const move = (i: number, dir: -1 | 1) =>
    setRules((r) => {
      const list = [...r.criteria];
      const j = i + dir;
      if (j < 0 || j >= list.length) return r;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...r, criteria: list };
    });

  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Seuls le propriétaire et le gérant peuvent modifier ces règles.
        </p>
      )}

      <Section title="Composition de la note" description="La part de chaque élément dans la note du jour sur 20.">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {PARTS.map((p) => (
            <div
              key={p}
              className={cn("h-full transition-all", PART_STYLE[p].bar)}
              style={{ width: `${rules.weights[p]}%` }}
            />
          ))}
        </div>
        {PARTS.map((p) => (
          <div key={p} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", PART_STYLE[p].bar)} />
                {PART_STYLE[p].label}
              </span>
              <span className={cn("font-semibold tabular-nums", PART_STYLE[p].text)}>{rules.weights[p]} %</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={rules.weights[p]}
              disabled={!canEdit}
              onChange={(e) => setRules((r) => ({ ...r, weights: rebalance(r.weights, p, Number(e.target.value)) }))}
              className="w-full"
              style={{ accentColor: SLIDER_COLOR[p] }}
              aria-label={`Part ${PART_STYLE[p].label}`}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Bougez un curseur : les deux autres s&apos;ajustent pour garder 100 %.
        </p>
      </Section>

      <Section
        title="Ventes"
        description="La meilleure de l'équipe ce jour-là a 20 ; les autres sont notées par rapport à elle."
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Nombre de ventes {rules.salesCountShare} %</span>
          <span>Montant vendu {100 - rules.salesCountShare} %</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={rules.salesCountShare}
          disabled={!canEdit}
          onChange={(e) => setRules((r) => ({ ...r, salesCountShare: Number(e.target.value) }))}
          className="w-full accent-[var(--primary)]"
          aria-label="Part du nombre de ventes"
        />
      </Section>

      <Section
        title="Ponctualité"
        description="Chaque serveuse part de 20 et perd des points en cas de retard ou de départ anticipé."
      >
        <Stepper
          label="Tolérance"
          value={rules.graceMinutes}
          min={0}
          max={60}
          suffix="min"
          disabled={!canEdit}
          onChange={(v) => setRules((r) => ({ ...r, graceMinutes: v }))}
        />
        <Stepper
          label="1 point perdu par retard de"
          value={rules.lateStepMinutes}
          min={1}
          max={120}
          suffix="min"
          disabled={!canEdit}
          onChange={(v) => setRules((r) => ({ ...r, lateStepMinutes: v }))}
        />
        <Stepper
          label="1 point perdu par départ anticipé de"
          value={rules.earlyStepMinutes}
          min={1}
          max={120}
          suffix="min"
          disabled={!canEdit}
          onChange={(v) => setRules((r) => ({ ...r, earlyStepMinutes: v }))}
        />
        <div className="rounded-xl bg-sun-soft px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Exemple : arrivée avec </span>
          <input
            type="number"
            min={0}
            max={240}
            value={exampleLate}
            onChange={(e) => setExampleLate(Math.max(0, Number(e.target.value) || 0))}
            className="mx-1 w-14 rounded-md border border-border bg-card px-1.5 py-0.5 text-center tabular-nums"
            aria-label="Minutes de retard pour l'exemple"
          />
          <span className="text-muted-foreground">min de retard → </span>
          <span className="font-semibold text-sun">{example.score}/20</span>
          <span className="text-muted-foreground">
            {" "}
            ({example.latePoints} point{example.latePoints > 1 ? "s" : ""} perdu{example.latePoints > 1 ? "s" : ""})
          </span>
        </div>
      </Section>

      <Section title="Critères de comportement" description="Notés de 1 à 5 étoiles chaque jour par un responsable.">
        <div className="space-y-2">
          {rules.criteria.map((c, i) => (
            <div key={c.key} className={cn("space-y-2 rounded-xl border border-border p-3", !c.active && "opacity-60")}>
              <div className="flex items-center gap-2">
                <Input
                  value={c.label}
                  disabled={!canEdit}
                  onChange={(e) => updateCriterion(i, { label: e.target.value })}
                  placeholder="Nom du critère"
                  className="h-9 font-medium"
                />
                <div className="flex shrink-0">
                  <button
                    type="button"
                    disabled={!canEdit || i === 0}
                    onClick={() => move(i, -1)}
                    className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"
                    aria-label="Monter"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || i === rules.criteria.length - 1}
                    onClick={() => move(i, 1)}
                    className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30"
                    aria-label="Descendre"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  {!savedKeys.includes(c.key) && (
                    <button
                      type="button"
                      onClick={() => setRules((r) => ({ ...r, criteria: r.criteria.filter((_, j) => j !== i) }))}
                      className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/10"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <Input
                value={c.hint}
                disabled={!canEdit}
                onChange={(e) => updateCriterion(i, { hint: e.target.value })}
                placeholder="Ce qu'on observe (aide pour la personne qui note)"
                className="h-9 text-xs"
              />
              <label className="flex w-fit cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={c.active}
                  disabled={!canEdit}
                  onChange={(e) => updateCriterion(i, { active: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {c.active ? "Utilisé dans la notation" : "Désactivé (conservé dans l'historique)"}
              </label>
            </div>
          ))}
        </div>
        {canEdit && rules.criteria.length < 12 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRules((r) => ({
                ...r,
                criteria: [
                  ...r.criteria,
                  {
                    key: criterionKey(
                      `critere ${r.criteria.length + 1}`,
                      r.criteria.map((c) => c.key)
                    ),
                    label: "",
                    hint: "",
                    active: true,
                  },
                ],
              }))
            }
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter un critère
          </Button>
        )}
      </Section>

      {changes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Changements précédents :{" "}
          {changes
            .slice(0, 5)
            .map((c) => formatDay(c.effectiveFrom, { day: "numeric", month: "short", year: "numeric" }))
            .join(" · ")}
        </p>
      )}

      {canEdit && (
        <div className="sticky -bottom-6 -mx-6 -mb-6 space-y-2 border-t border-border bg-card px-6 py-4">
          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRules(defaults)}>
              <RotateCcw className="h-3.5 w-3.5" /> Réglages par défaut
            </Button>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button
                type="button"
                disabled={!changed || !!error}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Enregistrer
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Appliqué à partir d&apos;aujourd&apos;hui ({formatDay(today, { day: "numeric", month: "long" })}). Les notes
            des jours passés ne changent pas.
          </p>
        </div>
      )}
    </div>
  );
}

/** Réglage des règles de notation des serveuses pour un point de vente. */
export function RulesDialog({ venueId, onClose }: { venueId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["staff-scoring-rules", venueId],
    queryFn: async () => {
      const res = await fetch(`/api/staff-scoring-rules?venueId=${venueId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
  });

  return (
    <Dialog
      title="Règles de notation"
      subtitle="Comment est calculée la note du jour de chaque serveuse."
      onClose={onClose}
      wide
    >
      {isLoading || !data ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <RulesEditor
          venueId={venueId}
          initial={data.rules}
          defaults={data.defaults}
          canEdit={data.canEdit}
          today={data.today}
          changes={data.changes}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}
