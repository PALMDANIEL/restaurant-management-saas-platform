import { db } from "@/db";
import { shiftGroups, shiftPlanBlocks } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type Shift = "jour" | "soir";
export type PlanBlock = { id?: number; groupId: number; shift: Shift; startDate: string; endDate: string };
export type Resolution = {
  /** Service du jour : matin, soir, repos (jour de repos ou groupe non planifié) ou null (rien de prévu). */
  status: Shift | "repos" | null;
  /** Pourquoi : "repos-hebdo", "planning", "groupe-libre" ou "equipe-fixe". */
  reason: "repos-hebdo" | "planning" | "groupe-libre" | "equipe-fixe" | "aucune";
};

type Person = { shiftGroup: Shift | null; restDay: number | null; rotationGroupId: number | null };

/** Jour de la semaine (0 = dimanche … 6 = samedi) d'une date AAAA-MM-JJ. */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) keys.push(k);
  return keys;
}

/**
 * Service d'une personne un jour donné.
 * 1. Son jour de repos hebdomadaire l'emporte sur tout.
 * 2. Rangée dans un groupe de rotation : le planning décide ; sans bloc ce jour-là, le groupe se repose,
 *    sauf si le planning est vide ce jour-là pour tous (rien n'est encore programmé) : on retombe sur son équipe fixe.
 * 3. Sinon : son équipe fixe (matin / soir), comme avant.
 */
export function resolveShift(person: Person, dateKey: string, blocks: PlanBlock[]): Resolution {
  if (person.restDay !== null && person.restDay === weekdayOf(dateKey)) {
    return { status: "repos", reason: "repos-hebdo" };
  }
  if (person.rotationGroupId !== null) {
    const covering = blocks.filter((b) => b.startDate <= dateKey && dateKey <= b.endDate);
    if (covering.length === 0) {
      return person.shiftGroup
        ? { status: person.shiftGroup, reason: "equipe-fixe" }
        : { status: null, reason: "aucune" };
    }
    const mine = covering.find((b) => b.groupId === person.rotationGroupId);
    return mine ? { status: mine.shift, reason: "planning" } : { status: "repos", reason: "groupe-libre" };
  }
  return person.shiftGroup ? { status: person.shiftGroup, reason: "equipe-fixe" } : { status: null, reason: "aucune" };
}

export async function loadPlan(venueId: number, from?: string, to?: string) {
  const [groups, blocks] = await Promise.all([
    db.select().from(shiftGroups).where(eq(shiftGroups.venueId, venueId)).orderBy(shiftGroups.id),
    db
      .select()
      .from(shiftPlanBlocks)
      .where(eq(shiftPlanBlocks.venueId, venueId))
      .orderBy(shiftPlanBlocks.startDate),
  ]);
  const inRange = (b: { startDate: string; endDate: string }) => (!to || b.startDate <= to) && (!from || b.endDate >= from);
  return { groups, blocks: blocks.filter(inRange) };
}

export type GenerateMode = "matin-tourne" | "un-par-service";

/**
 * Prérempli un planning. Chaque bloc dure `daysPerBlock` jours.
 * - "matin-tourne" : un groupe au matin (chacun son tour), tous les autres au soir.
 *   A fait 3 jours de matin pendant que B et C sont au soir ; puis B au matin, A et C au soir ; etc.
 * - "un-par-service" : un groupe au matin, le suivant au soir, le dernier se repose.
 */
export function generateBlocks(opts: {
  groupIds: number[];
  startDate: string;
  endDate: string;
  daysPerBlock: number;
  mode: GenerateMode;
}): PlanBlock[] {
  const { groupIds: g, startDate, endDate, daysPerBlock, mode } = opts;
  const out: PlanBlock[] = [];
  if (g.length === 0 || daysPerBlock < 1) return out;
  let k = 0;
  for (let from = startDate; from <= endDate; from = addDays(from, daysPerBlock), k++) {
    const to = addDays(from, daysPerBlock - 1) > endDate ? endDate : addDays(from, daysPerBlock - 1);
    const morning = g[k % g.length];
    out.push({ groupId: morning, shift: "jour", startDate: from, endDate: to });
    if (mode === "matin-tourne") {
      for (const id of g) if (id !== morning) out.push({ groupId: id, shift: "soir", startDate: from, endDate: to });
    } else if (g.length > 1) {
      out.push({ groupId: g[(k + 1) % g.length], shift: "soir", startDate: from, endDate: to });
    }
  }
  return out;
}

/** Remplace les blocs qui touchent [from, to] par `blocks` (les blocs partiellement hors plage sont raccourcis). */
export async function replaceRange(venueId: number, from: string, to: string, blocks: PlanBlock[]) {
  const existing = await db.select().from(shiftPlanBlocks).where(eq(shiftPlanBlocks.venueId, venueId));
  for (const b of existing) {
    if (b.endDate < from || b.startDate > to) continue;
    await db.delete(shiftPlanBlocks).where(eq(shiftPlanBlocks.id, b.id));
    if (b.startDate < from) {
      await db.insert(shiftPlanBlocks).values({ venueId, groupId: b.groupId, shift: b.shift, startDate: b.startDate, endDate: addDays(from, -1) });
    }
    if (b.endDate > to) {
      await db.insert(shiftPlanBlocks).values({ venueId, groupId: b.groupId, shift: b.shift, startDate: addDays(to, 1), endDate: b.endDate });
    }
  }
  if (blocks.length) {
    await db.insert(shiftPlanBlocks).values(blocks.map((b) => ({ venueId, groupId: b.groupId, shift: b.shift, startDate: b.startDate, endDate: b.endDate })));
  }
}

export async function groupBelongsToVenue(groupId: number, venueId: number) {
  const [g] = await db
    .select({ id: shiftGroups.id })
    .from(shiftGroups)
    .where(and(eq(shiftGroups.id, groupId), eq(shiftGroups.venueId, venueId)))
    .limit(1);
  return !!g;
}
