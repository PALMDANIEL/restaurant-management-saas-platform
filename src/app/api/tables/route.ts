import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { restaurantTables } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ tables: [] });
    const rows = await db.select().from(restaurantTables).where(inArray(restaurantTables.venueId, venueIds));
    return NextResponse.json({ tables: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  number: z.string().min(1),
  capacity: z.number().min(1).default(4),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageVenues");
    const body = createSchema.parse(await req.json());
    const [table] = await db.insert(restaurantTables).values(body).returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "table", entityId: table.id });
    return NextResponse.json({ table }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageVenues");
    const id = Number(req.nextUrl.searchParams.get("id"));
    await db.delete(restaurantTables).where(eq(restaurantTables.id, id));
    await logAudit({ userId: session.userId, action: "delete", entity: "table", entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
