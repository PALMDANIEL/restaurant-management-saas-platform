import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError } from "@/lib/api-helpers";
import { can } from "@/lib/rbac";

const MIN_ORDERS_FOR_SCORE = 3;
/** Au-delà de ce temps de service (minutes), le score de rapidité tombe à 0. */
const SLOW_SERVICE_THRESHOLD_MIN = 30;

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.role, "manageUsers") && !can(session.role, "manageServers")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ performance: [] });

    const rows = await db
      .select({
        serverId: orders.serverId,
        total: sql<number>`count(*) filter (where ${orders.status} in ('served','paid','cancelled'))`.mapWith(Number),
        completed: sql<number>`count(*) filter (where ${orders.status} in ('served','paid'))`.mapWith(Number),
        cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')`.mapWith(Number),
        avgServiceMinutes: sql<number | null>`avg(extract(epoch from (${orders.servedAt} - ${orders.createdAt})) / 60) filter (where ${orders.servedAt} is not null)`.mapWith(
          (v) => (v === null ? null : Number(v))
        ),
      })
      .from(orders)
      .where(and(inArray(orders.venueId, venueIds), isNotNull(orders.serverId), gte(orders.createdAt, startOfMonth())))
      .groupBy(orders.serverId);

    const serverIds = rows.map((r) => r.serverId).filter((id): id is number => id !== null);
    const staff = serverIds.length
      ? await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, active: users.active })
          .from(users)
          .where(and(inArray(users.id, serverIds), eq(users.role, "serveuse")))
      : [];

    const performance = staff.map((s) => {
      const row = rows.find((r) => r.serverId === s.id)!;
      const completionRate = row.total > 0 ? row.completed / row.total : 0;
      const cancellationRate = row.total > 0 ? row.cancelled / row.total : 0;
      const speedScore =
        row.avgServiceMinutes === null ? 0.5 : Math.max(0, Math.min(1, 1 - row.avgServiceMinutes / SLOW_SERVICE_THRESHOLD_MIN));

      const hasEnoughData = row.total >= MIN_ORDERS_FOR_SCORE;
      const rawScore = 60 * completionRate + 40 * speedScore - 20 * cancellationRate;
      const score = hasEnoughData ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;

      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        active: s.active,
        totalOrders: row.total,
        completedOrders: row.completed,
        cancelledOrders: row.cancelled,
        avgServiceMinutes: row.avgServiceMinutes !== null ? Math.round(row.avgServiceMinutes) : null,
        score,
      };
    });

    return NextResponse.json({ performance });
  } catch (error) {
    return handleApiError(error);
  }
}
