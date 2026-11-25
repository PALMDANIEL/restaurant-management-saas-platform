import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { announcements, meetings, users, userVenues, venues } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { requireCompanySession, getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";
import { can } from "@/lib/rbac";
import { getShiftSettings } from "@/lib/shift-settings";
import { getBusinessDate } from "@/lib/business-day";
import { addDays, dateKeysBetween, loadPlan, resolveShift } from "@/lib/shift-plan";

/**
 * Page « Infos & réunions » de la personne connectée : son groupe, son repos, ses 14 prochains
 * jours, les infos en cours et les réunions à venir qui la concernent. Les managers voient
 * toutes les réunions du point de vente.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    const accessible = await getAccessibleVenueIds(session);
    const asked = Number(req.nextUrl.searchParams.get("venueId"));
    let venueId = asked && accessible.includes(asked) ? asked : 0;
    if (!venueId) {
      const mine = await db.select({ venueId: userVenues.venueId }).from(userVenues).where(eq(userVenues.userId, session.userId));
      venueId = mine.map((m) => m.venueId).find((id) => accessible.includes(id)) ?? accessible[0] ?? 0;
    }
    if (!venueId) return NextResponse.json({ venue: null, serverNow: new Date().toISOString() });

    const [me] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    const [venue] = await db.select({ id: venues.id, name: venues.name }).from(venues).where(eq(venues.id, venueId)).limit(1);
    const settings = await getShiftSettings(venueId);
    const today = getBusinessDate(new Date(), settings.nightEndTime);
    const days = dateKeysBetween(today, addDays(today, 13));
    const { groups, blocks } = await loadPlan(venueId, days[0], days[days.length - 1]);
    const group = me?.rotationGroupId ? groups.find((g) => g.id === me.rotationGroupId) ?? null : null;

    const myDays = me ? days.map((date) => ({ date, ...resolveShift(me, date, blocks) })) : [];

    // Collègues du même groupe (prénoms seulement) et groupes du point de vente pour les managers.
    let mates: { id: number; firstName: string }[] = [];
    if (group) {
      const assigned = await db.select({ userId: userVenues.userId }).from(userVenues).where(eq(userVenues.venueId, venueId));
      const ids = assigned.map((a) => a.userId);
      mates = ids.length
        ? await db
            .select({ id: users.id, firstName: users.firstName })
            .from(users)
            .where(and(inArray(users.id, ids), eq(users.rotationGroupId, group.id), eq(users.active, true), eq(users.companyId, session.companyId)))
        : [];
    }

    const now = new Date();
    const infos = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.venueId, venueId), or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now))))
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(50);

    const manager = can(session.role, "manageServers");
    // Réunions de la dernière heure à venir : la liste des prochaines + celles qui viennent de commencer.
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const all = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.venueId, venueId), gte(meetings.startsAt, since)))
      .orderBy(asc(meetings.startsAt))
      .limit(100);
    const visible = manager ? all : all.filter((m) => !m.groupIds || (me?.rotationGroupId != null && m.groupIds.includes(me.rotationGroupId)));

    return NextResponse.json({
      serverNow: now.toISOString(),
      venue,
      manager,
      me: me ? { id: me.id, firstName: me.firstName, shiftGroup: me.shiftGroup, restDay: me.restDay } : null,
      group,
      mates,
      groups: manager ? groups : undefined,
      days: myDays,
      announcements: infos,
      meetings: visible,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
