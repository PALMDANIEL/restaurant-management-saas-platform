import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ suppliers: [] });
    const rows = await db.select().from(suppliers).where(inArray(suppliers.venueId, venueIds));
    return NextResponse.json({ suppliers: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageSuppliers");
    const body = createSchema.parse(await req.json());
    const [supplier] = await db.insert(suppliers).values(body).returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "supplier", entityId: supplier.id, details: body });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageSuppliers");
    const id = Number(req.nextUrl.searchParams.get("id"));
    await db.delete(suppliers).where(eq(suppliers.id, id));
    await logAudit({ userId: session.userId, action: "delete", entity: "supplier", entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
