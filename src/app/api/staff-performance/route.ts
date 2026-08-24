import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, userVenues, orders, attendanceRecords } from "@/db/schema";
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { requireSession, getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";
import { getShiftSettings } from "@/lib/shift-settings";
import { getBusinessDate, businessDateRange } from "@/lib/business-day";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    if (!venueId) return NextResponse.json({ error: "venueId requis" }, { status: 400 });

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    const settings = await getShiftSettings(venueId);
    const workDate = req.nextUrl.searchParams.get("workDate") || getBusinessDate(new Date(), settings.nightEndTime);
    const { start, end } = businessDateRange(workDate, settings.nightEndTime);

    const assigned = await db.select({ userId: userVenues.userId }).from(userVenues).where(eq(userVenues.venueId, venueId));
    const assignedIds = assigned.map((a) => a.userId);
    const servers = assignedIds.length
      ? await db
          .select()
          .from(users)
          .where(and(inArray(users.id, assignedIds), eq(users.role, "serveuse"), eq(users.active, true)))
      : [];

    if (servers.length === 0) {
      return NextResponse.json({ workDate, settings, staff: [] });
    }
    const serverIds = servers.map((s) => s.id);

    const orderRows = await db
      .select({ serverId: orders.serverId, totalAmount: orders.totalAmount })
      .from(orders)
      .where(
        and(
          eq(orders.venueId, venueId),
          inArray(orders.serverId, serverIds),
          gte(orders.createdAt, start),
          lt(orders.createdAt, end),
          ne(orders.status, "cancelled")
        )
      );

    const attendanceRows = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.venueId, venueId),
          eq(attendanceRecords.workDate, workDate),
          inArray(attendanceRecords.userId, serverIds)
        )
      );

    const staff = servers
      .map((s) => {
        const myOrders = orderRows.filter((o) => o.serverId === s.id);
        const totalSales = myOrders.reduce((sum, o) => sum + o.totalAmount, 0);
        const myAttendance = attendanceRows
          .filter((a) => a.userId === s.id)
          .sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
        const totalMinutesWorked = myAttendance.reduce((sum, a) => {
          const clockOutTime = a.clockOut ?? new Date();
          return sum + Math.max(0, (clockOutTime.getTime() - a.clockIn.getTime()) / 60000);
        }, 0);

        return {
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          shiftGroup: s.shiftGroup,
          orderCount: myOrders.length,
          totalSales,
          averageTicket: myOrders.length > 0 ? Math.round(totalSales / myOrders.length) : 0,
          attendance: myAttendance.map((a) => ({
            id: a.id,
            clockIn: a.clockIn,
            clockOut: a.clockOut,
          })),
          minutesWorked: Math.round(totalMinutesWorked),
          currentlyClocked: myAttendance.some((a) => !a.clockOut),
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);

    return NextResponse.json({ workDate, settings, staff });
  } catch (error) {
    return handleApiError(error);
  }
}
