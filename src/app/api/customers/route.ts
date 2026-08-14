import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ customers: [] });
    const rows = await db
      .select()
      .from(customers)
      .where(inArray(customers.venueId, venueIds));
    return NextResponse.json({ customers: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  name: z.string().min(1),
  phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCustomers");
    const body = createSchema.parse(await req.json());
    const [customer] = await db
      .insert(customers)
      .values({ venueId: body.venueId, name: body.name, phone: body.phone })
      .returning();
    await logAudit({
      userId: session.userId,
      venueId: body.venueId,
      action: "create",
      entity: "customer",
      entityId: customer.id,
      details: body,
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCustomers");
    const body = updateSchema.parse(await req.json());
    const { id, ...rest } = body;
    const [updated] = await db.update(customers).set(rest).where(eq(customers.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
    await logAudit({ userId: session.userId, venueId: updated.venueId, action: "update", entity: "customer", entityId: id, details: rest });
    return NextResponse.json({ customer: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
