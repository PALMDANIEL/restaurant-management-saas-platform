import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { venues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireCompanySession, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET() {
  try {
    const session = await requireCompanySession();
    const rows = await db.select().from(venues).where(eq(venues.companyId, session.companyId));
    return NextResponse.json({ venues: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["maquis", "restaurant", "bar", "fastfood"]).default("maquis"),
  address: z.string().optional(),
  phone: z.string().optional(),
  qrOrderingEnabled: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageVenues");
    const body = createSchema.parse(await req.json());
    const [venue] = await db.insert(venues).values({ ...body, companyId: session.companyId }).returning();
    await logAudit({ userId: session.userId, venueId: venue.id, action: "create", entity: "venue", entityId: venue.id, details: body });
    return NextResponse.json({ venue }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  type: z.enum(["maquis", "restaurant", "bar", "fastfood"]).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  qrOrderingEnabled: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageVenues");
    const body = updateSchema.parse(await req.json());
    const { id, ...rest } = body;
    const [updated] = await db.update(venues).set(rest).where(eq(venues.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    await logAudit({ userId: session.userId, venueId: id, action: "update", entity: "venue", entityId: id, details: rest });
    return NextResponse.json({ venue: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
