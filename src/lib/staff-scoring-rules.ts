/**
 * Note du jour des serveuses, sur 20, à partir de trois éléments :
 * - ventes : nombre et montant, comparés à la meilleure de la même équipe ce jour-là ;
 * - comportement : fiche remplie par un responsable (5 critères de 1 à 5) ;
 * - ponctualité : arrivée et départ comparés aux horaires de son équipe.
 * Si la fiche de comportement n'est pas encore remplie, la note est calculée sur le reste
 * et marquée « provisoire ».
 */
export const NOTE_WEIGHTS = { sales: 0.4, behavior: 0.4, punctuality: 0.2 } as const;
/** Minutes de tolérance avant de compter un retard ou un départ anticipé. */
export const GRACE_MINUTES = 5;
/** Un point (sur 20) perdu par tranche de LATE_STEP minutes de retard au-delà de la tolérance. */
export const LATE_STEP = 5;
/** Un point (sur 20) perdu par tranche d'EARLY_STEP minutes de départ anticipé. */
export const EARLY_STEP = 10;

export const BEHAVIOR_CRITERIA = ["courtesy", "appearance", "teamwork", "rigor", "responsiveness"] as const;
export type BehaviorCriterion = (typeof BEHAVIOR_CRITERIA)[number];
