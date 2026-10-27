import { z } from "zod";

/**
 * Règles de notation des serveuses (note du jour sur 20). Ce module ne dépend pas de la base :
 * il sert au serveur pour calculer les notes et à l'écran de réglage pour l'aperçu en direct.
 *
 * La note du jour combine trois éléments, chacun sur 20 :
 * - ventes : nombre et montant, comparés à la meilleure de la même équipe ce jour-là ;
 * - comportement : fiche remplie par un responsable (critères notés de 1 à 5) ;
 * - ponctualité : arrivée et départ comparés aux horaires de son équipe.
 */

export const criterionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1, "Chaque critère doit avoir un nom").max(60),
  hint: z.string().trim().max(140).default(""),
  active: z.boolean().default(true),
});

export const scoringRulesSchema = z
  .object({
    /** Part de chaque élément dans la note du jour, en pourcentage (total 100). */
    weights: z.object({
      sales: z.number().int().min(0).max(100),
      behavior: z.number().int().min(0).max(100),
      punctuality: z.number().int().min(0).max(100),
    }),
    /** Dans la note des ventes, part du nombre de ventes (le reste : le montant), en %. */
    salesCountShare: z.number().int().min(0).max(100),
    /** Minutes de tolérance avant de compter un retard ou un départ anticipé. */
    graceMinutes: z.number().int().min(0).max(60),
    /** Un point perdu par tranche de `lateStepMinutes` minutes de retard au-delà de la tolérance. */
    lateStepMinutes: z.number().int().min(1).max(120),
    /** Un point perdu par tranche de `earlyStepMinutes` minutes de départ anticipé. */
    earlyStepMinutes: z.number().int().min(1).max(120),
    criteria: z.array(criterionSchema).min(1).max(12),
  })
  .refine((r) => r.weights.sales + r.weights.behavior + r.weights.punctuality === 100, {
    message: "Les parts ventes, comportement et ponctualité doivent faire 100 % au total.",
    path: ["weights"],
  })
  .refine((r) => r.criteria.some((c) => c.active), {
    message: "Gardez au moins un critère de comportement actif.",
    path: ["criteria"],
  })
  .refine((r) => new Set(r.criteria.map((c) => c.key)).size === r.criteria.length, {
    message: "Deux critères ont la même clé.",
    path: ["criteria"],
  });

export type ScoringRules = z.infer<typeof scoringRulesSchema>;
export type BehaviorCriterion = z.infer<typeof criterionSchema>;

export const DEFAULT_SCORING_RULES: ScoringRules = {
  weights: { sales: 40, behavior: 40, punctuality: 20 },
  salesCountShare: 50,
  graceMinutes: 5,
  lateStepMinutes: 5,
  earlyStepMinutes: 10,
  criteria: [
    { key: "courtesy", label: "Accueil et politesse", hint: "Sourire, salutation, ton avec les clients", active: true },
    { key: "appearance", label: "Tenue", hint: "Uniforme, propreté, présentation", active: true },
    {
      key: "teamwork",
      label: "Esprit d'équipe",
      hint: "Entraide, respect des collègues et de la hiérarchie",
      active: true,
    },
    { key: "rigor", label: "Rigueur", hint: "Commandes justes, argent remis, consignes suivies", active: true },
    { key: "responsiveness", label: "Réactivité", hint: "Attention aux tables, rapidité, disponibilité", active: true },
  ],
};

/** Lit des règles enregistrées ; revient aux règles par défaut si elles sont illisibles. */
export function parseRules(raw: unknown): ScoringRules {
  const parsed = scoringRulesSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SCORING_RULES;
}

/** Clé stable pour un nouveau critère, tirée de son nom (sans accents) et unique. */
export function criterionKey(label: string, taken: string[]) {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "critere";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

const clamp20 = (n: number) => Math.max(0, Math.min(20, n));
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Note de ponctualité sur 20, et le détail des points perdus. */
export function punctualityScore(rules: ScoringRules, lateMinutes: number, earlyLeaveMinutes: number) {
  const latePoints = Math.ceil(Math.max(0, lateMinutes - rules.graceMinutes) / rules.lateStepMinutes);
  const earlyPoints = Math.ceil(Math.max(0, earlyLeaveMinutes - rules.graceMinutes) / rules.earlyStepMinutes);
  return { score: clamp20(20 - latePoints - earlyPoints), latePoints, earlyPoints };
}

/** Note des ventes sur 20, par rapport à la meilleure de l'équipe. */
export function salesScore(
  rules: ScoringRules,
  mine: { count: number; amount: number },
  best: { count: number; amount: number }
) {
  if (best.count === 0) return 0;
  const share = rules.salesCountShare / 100;
  return round1(20 * (share * (mine.count / best.count) + (1 - share) * (best.amount ? mine.amount / best.amount : 0)));
}

/**
 * Note de comportement sur 20 : moyenne des critères actifs notés (de 1 à 5). Un critère
 * ajouté après la fiche, ou laissé vide, n'est simplement pas compté.
 */
export function behaviorScore(rules: ScoringRules, scores: Record<string, number>) {
  const values = rules.criteria.filter((c) => c.active && scores[c.key]).map((c) => scores[c.key]);
  if (values.length === 0) return null;
  return round1((values.reduce((a, b) => a + b, 0) / values.length / 5) * 20);
}

/** Moyenne pondérée des éléments disponibles (les parts sont rééquilibrées s'il en manque). */
export function dayNote(
  rules: ScoringRules,
  parts: { sales: number | null; behavior: number | null; punctuality: number | null }
) {
  const items: [number, number][] = [];
  if (parts.sales !== null) items.push([parts.sales, rules.weights.sales]);
  if (parts.behavior !== null) items.push([parts.behavior, rules.weights.behavior]);
  if (parts.punctuality !== null) items.push([parts.punctuality, rules.weights.punctuality]);
  const weight = items.reduce((sum, [, w]) => sum + w, 0);
  return weight ? round1(items.reduce((sum, [v, w]) => sum + v * w, 0) / weight) : null;
}
