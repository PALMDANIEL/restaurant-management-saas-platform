import { db } from "@/db";
import { attendanceRecords, orders, staffBehaviorRatings, staffScoringRules, userVenues, users } from "@/db/schema";
import { and, asc, eq, gte, inArray, lt, lte, ne } from "drizzle-orm";
import { getShiftSettings } from "./shift-settings";
import { businessDateRange, getBusinessDate, toDateKey } from "./business-day";
import {
  DEFAULT_SCORING_RULES,
  behaviorScore,
  dayNote,
  parseRules,
  punctualityScore,
  salesScore,
  type ScoringRules,
} from "./staff-scoring-rules";

export * from "./staff-scoring-rules";

type Settings = Awaited<ReturnType<typeof getShiftSettings>>;
type ShiftGroup = "jour" | "soir";

function atTime(dateKey: string, hhmm: string, addDays = 0) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d + addDays, h || 0, min || 0, 0, 0);
}

/** Horaires prévus d'une équipe pour une journée d'exploitation. */
export function scheduledShift(dateKey: string, group: ShiftGroup, settings: Settings) {
  if (group === "jour") {
    return { start: atTime(dateKey, settings.dayStartTime), end: atTime(dateKey, settings.dayEndTime) };
  }
  const start = atTime(dateKey, settings.nightStartTime);
  const sameDay = settings.nightEndTime > settings.nightStartTime;
  return { start, end: atTime(dateKey, settings.nightEndTime, sameDay ? 0 : 1) };
}

function dateKeysBetween(from: string, to: string) {
  const keys: string[] = [];
  const d = atTime(from, "12:00");
  const last = atTime(to, "12:00");
  while (d <= last) {
    keys.push(toDateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

type RuleVersion = { effectiveFrom: string; rules: ScoringRules; updatedAt: Date | null };

/** Toutes les versions des règles d'un point de vente, de la plus ancienne à la plus récente. */
export async function getRuleVersions(venueId: number): Promise<RuleVersion[]> {
  const rows = await db
    .select()
    .from(staffScoringRules)
    .where(eq(staffScoringRules.venueId, venueId))
    .orderBy(asc(staffScoringRules.effectiveFrom));
  return rows.map((r) => ({ effectiveFrom: r.effectiveFrom, rules: parseRules(r.rules), updatedAt: r.updatedAt }));
}

/** Règles en vigueur une journée donnée (les règles par défaut avant toute modification). */
export function rulesFor(versions: RuleVersion[], workDate: string): ScoringRules {
  let current = DEFAULT_SCORING_RULES;
  for (const v of versions) if (v.effectiveFrom <= workDate) current = v.rules;
  return current;
}

export type StaffDay = {
  userId: number;
  workDate: string;
  shiftGroup: ShiftGroup | null;
  orderCount: number;
  totalSales: number;
  averageTicket: number;
  attendance: { id: number; clockIn: Date; clockOut: Date | null; corrected: boolean; correctionNote: string | null }[];
  minutesWorked: number;
  currentlyClocked: boolean;
  punctuality: {
    scheduledStart: Date;
    scheduledEnd: Date;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    latePoints: number;
    earlyPoints: number;
    score: number;
  } | null;
  behavior: { id: number; scores: Record<string, number>; comment: string | null; score: number | null } | null;
  salesScore: number | null;
  /** Note du jour sur 20 (null si la personne n'a ni pointé ni vendu). */
  note: number | null;
  provisional: boolean;
  absent: boolean;
};

/**
 * Calcule, pour chaque serveuse rattachée au point de vente, le détail de chaque journée
 * d'exploitation entre `from` et `to` (dates YYYY-MM-DD incluses), avec les règles de
 * notation en vigueur chacun de ces jours.
 */
export async function computeStaffDays(opts: {
  venueId: number;
  from: string;
  to: string;
  userIds?: number[];
  includeInactive?: boolean;
}) {
  const [settings, versions] = await Promise.all([getShiftSettings(opts.venueId), getRuleVersions(opts.venueId)]);
  const assigned = await db
    .select({ userId: userVenues.userId })
    .from(userVenues)
    .where(eq(userVenues.venueId, opts.venueId));
  let ids = assigned.map((a) => a.userId);
  if (opts.userIds) ids = ids.filter((id) => opts.userIds!.includes(id));
  const servers = ids.length
    ? await db
        .select()
        .from(users)
        .where(
          and(
            inArray(users.id, ids),
            eq(users.role, "serveuse"),
            ...(opts.includeInactive ? [] : [eq(users.active, true)])
          )
        )
    : [];
  if (servers.length === 0) return { settings, versions, servers, days: [] as StaffDay[] };
  const serverIds = servers.map((s) => s.id);

  const start = businessDateRange(opts.from, settings.nightEndTime).start;
  const end = businessDateRange(opts.to, settings.nightEndTime).end;

  const [orderRows, attendanceRows, ratingRows] = await Promise.all([
    db
      .select({ serverId: orders.serverId, totalAmount: orders.totalAmount, createdAt: orders.createdAt })
      .from(orders)
      .where(
        and(
          eq(orders.venueId, opts.venueId),
          inArray(orders.serverId, serverIds),
          gte(orders.createdAt, start),
          lt(orders.createdAt, end),
          ne(orders.status, "cancelled")
        )
      ),
    db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.venueId, opts.venueId),
          inArray(attendanceRecords.userId, serverIds),
          gte(attendanceRecords.workDate, opts.from),
          lte(attendanceRecords.workDate, opts.to)
        )
      ),
    db
      .select()
      .from(staffBehaviorRatings)
      .where(
        and(
          eq(staffBehaviorRatings.venueId, opts.venueId),
          inArray(staffBehaviorRatings.userId, serverIds),
          gte(staffBehaviorRatings.workDate, opts.from),
          lte(staffBehaviorRatings.workDate, opts.to)
        )
      ),
  ]);

  const now = new Date();
  const days: StaffDay[] = [];
  for (const workDate of dateKeysBetween(opts.from, opts.to)) {
    const rules = rulesFor(versions, workDate);
    const today: StaffDay[] = servers.map((s) => {
      const myOrders = orderRows.filter(
        (o) => o.serverId === s.id && getBusinessDate(o.createdAt, settings.nightEndTime) === workDate
      );
      const totalSales = myOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const myAttendance = attendanceRows
        .filter((a) => a.userId === s.id && a.workDate === workDate)
        .sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
      const minutesWorked = myAttendance.reduce(
        (sum, a) => sum + Math.max(0, ((a.clockOut ?? now).getTime() - a.clockIn.getTime()) / 60000),
        0
      );
      // L'équipe retenue est celle du pointage (elle a pu changer d'équipe depuis).
      const group = (myAttendance[0]?.shiftGroup ?? s.shiftGroup) as ShiftGroup | null;

      let punctuality: StaffDay["punctuality"] = null;
      if (group && myAttendance.length > 0) {
        const shift = scheduledShift(workDate, group, settings);
        const lateMinutes = Math.max(
          0,
          Math.round((myAttendance[0].clockIn.getTime() - shift.start.getTime()) / 60000)
        );
        const last = myAttendance[myAttendance.length - 1];
        const earlyLeaveMinutes = last.clockOut
          ? Math.max(0, Math.round((shift.end.getTime() - last.clockOut.getTime()) / 60000))
          : 0;
        punctuality = {
          scheduledStart: shift.start,
          scheduledEnd: shift.end,
          lateMinutes,
          earlyLeaveMinutes,
          ...punctualityScore(rules, lateMinutes, earlyLeaveMinutes),
        };
      }

      const r = ratingRows.find((x) => x.userId === s.id && x.workDate === workDate);
      return {
        userId: s.id,
        workDate,
        shiftGroup: group,
        orderCount: myOrders.length,
        totalSales,
        averageTicket: myOrders.length > 0 ? Math.round(totalSales / myOrders.length) : 0,
        attendance: myAttendance.map((a) => ({
          id: a.id,
          clockIn: a.clockIn,
          clockOut: a.clockOut,
          corrected: a.correctedBy !== null,
          correctionNote: a.correctionNote,
        })),
        minutesWorked: Math.round(minutesWorked),
        currentlyClocked: myAttendance.some((a) => !a.clockOut),
        punctuality,
        behavior: r ? { id: r.id, scores: r.scores, comment: r.comment, score: behaviorScore(rules, r.scores) } : null,
        salesScore: null,
        note: null,
        provisional: false,
        absent: false,
      };
    });

    // Ventes : comparées à la meilleure de la même équipe (le soir ne vend pas comme le matin).
    for (const group of ["jour", "soir", null] as const) {
      const team = today.filter((d) => d.shiftGroup === group && (d.attendance.length > 0 || d.orderCount > 0));
      const best = {
        count: Math.max(0, ...team.map((d) => d.orderCount)),
        amount: Math.max(0, ...team.map((d) => d.totalSales)),
      };
      for (const d of team) d.salesScore = salesScore(rules, { count: d.orderCount, amount: d.totalSales }, best);
    }

    const isPast = businessDateRange(workDate, settings.nightEndTime).end <= now;
    for (const d of today) {
      const present = d.attendance.length > 0 || d.orderCount > 0;
      if (!present) {
        // Absente seulement une fois la journée terminée et si elle avait une équipe.
        d.absent = isPast && d.shiftGroup !== null;
      } else {
        d.note = dayNote(rules, {
          sales: d.salesScore,
          behavior: d.behavior?.score ?? null,
          punctuality: d.punctuality?.score ?? null,
        });
        d.provisional = d.behavior?.score == null || !d.punctuality || d.currentlyClocked;
      }
      days.push(d);
    }
  }

  return { settings, versions, servers, days };
}
