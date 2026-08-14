import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ categories: [] });
    const rows = await db.select().from(categories).where(inArray(categories.venueId, venueIds));
    return NextResponse.json({ categories: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  name: z.string().min(1),
  color: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCategories");
    const body = createSchema.parse(await req.json());
    const [cat] = await db.insert(categories).values(body).returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "category", entityId: cat.id });
    return NextResponse.json({ category: cat }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCategories");
    const id = Number(req.nextUrl.searchParams.get("id"));
    await db.delete(categories).where(eq(categories.id, id));
    await logAudit({ userId: session.userId, action: "delete", entity: "category", entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
