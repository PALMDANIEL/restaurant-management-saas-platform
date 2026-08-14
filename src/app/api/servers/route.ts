import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, userVenues } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireCompanySession, handleApiError } from "@/lib/api-helpers";
import { can } from "@/lib/rbac";

/** Read-only list of active "serveuse" staff for a venue — used to assign who served an order. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    if (!can(session.role, "createSale") && !can(session.role, "manageOrders") && !can(session.role, "manageCashRegister")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    if (!venueId) return NextResponse.json({ servers: [] });

    const assigned = await db.select({ userId: userVenues.userId }).from(userVenues).where(eq(userVenues.venueId, venueId));
    const userIds = assigned.map((a) => a.userId);
    if (userIds.length === 0) return NextResponse.json({ servers: [] });

    const rows = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(inArray(users.id, userIds), eq(users.role, "serveuse"), eq(users.active, true), eq(users.companyId, session.companyId)));

    return NextResponse.json({ servers: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
