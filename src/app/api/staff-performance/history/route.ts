import { NextRequest, NextResponse } from "next/server";
import { requireSession, getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";
import { can } from "@/lib/rbac";
import { getShiftSettings } from "@/lib/shift-settings";
import { getBusinessDate, toDateKey } from "@/lib/business-day";
import { computeStaffDays, rulesFor } from "@/lib/staff-scoring";

const avg = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

/** Historique d'une serveuse sur les `days` dernières journées (30 par défaut, 92 au plus). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    const userId = Number(req.nextUrl.searchParams.get("userId"));
    if (!venueId || !userId) return NextResponse.json({ error: "venueId et userId requis" }, { status: 400 });
    // Une serveuse peut consulter son propre historique ; les responsables, celui de toutes.
    if (userId !== session.userId && !can(session.role, "manageServers")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    const count = Math.min(92, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
    const settings = await getShiftSettings(venueId);
    const to = getBusinessDate(new Date(), settings.nightEndTime);
    const fromDate = new Date(`${to}T12:00:00`);
    fromDate.setDate(fromDate.getDate() - (count - 1));
    const from = toDateKey(fromDate);

    const { servers, days, versions } = await computeStaffDays({ venueId, from, to, userIds: [userId], includeInactive: true });
    const server = servers[0];
    if (!server) return NextResponse.json({ error: "Serveuse introuvable" }, { status: 404 });

    const worked = days.filter((d) => d.attendance.length > 0 || d.orderCount > 0);
    const summary = {
      daysWorked: worked.length,
      daysAbsent: days.filter((d) => d.absent).length,
      daysLate: worked.filter((d) => (d.punctuality?.lateMinutes ?? 0) > 5).length,
      totalLateMinutes: worked.reduce((sum, d) => sum + (d.punctuality?.lateMinutes ?? 0), 0),
      orderCount: worked.reduce((sum, d) => sum + d.orderCount, 0),
      totalSales: worked.reduce((sum, d) => sum + d.totalSales, 0),
      minutesWorked: worked.reduce((sum, d) => sum + d.minutesWorked, 0),
      averageNote: avg(worked.map((d) => d.note).filter((n): n is number => n !== null)),
      averageBehavior: avg(days.map((d) => d.behavior?.score).filter((n): n is number => n != null)),
      averagePunctuality: avg(worked.map((d) => d.punctuality?.score).filter((n): n is number => n != null)),
    };

    return NextResponse.json({
      server: { id: server.id, firstName: server.firstName, lastName: server.lastName, shiftGroup: server.shiftGroup },
      from,
      to,
      summary,
      rules: rulesFor(versions, to),
      days: [...days].reverse(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
