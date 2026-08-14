import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "viewAuditLog");
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(venueIds.length > 0 ? inArray(auditLogs.venueId, venueIds) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(200);

    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as number[];
    const userRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];

    const enriched = rows.map((r) => {
      const u = userRows.find((usr) => usr.id === r.userId);
      return { ...r, userName: u ? `${u.firstName} ${u.lastName}` : "Système" };
    });

    return NextResponse.json({ logs: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}
