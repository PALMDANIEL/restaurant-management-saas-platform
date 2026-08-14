import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

const DEFAULT_CATEGORIES = [
  "Loyer",
  "Salaires",
  "Électricité / Eau",
  "Approvisionnement",
  "Maintenance",
  "Transport",
  "Marketing",
  "Autre",
];

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ categories: [] });

    const rows = await db
      .select()
      .from(expenseCategories)
      .where(inArray(expenseCategories.venueId, venueIds));

    // Auto-provision default categories the first time a venue has none configured yet,
    // so existing venues keep working exactly as before without manual setup.
    if (rows.length === 0 && venueIds.length === 1) {
      const created = await db
        .insert(expenseCategories)
        .values(DEFAULT_CATEGORIES.map((name) => ({ venueId: venueIds[0], name })))
        .returning();
      return NextResponse.json({ categories: created });
    }

    return NextResponse.json({ categories: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  name: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageExpenses");
    const body = createSchema.parse(await req.json());
    const [category] = await db.insert(expenseCategories).values(body).returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "expense_category", entityId: category.id, details: body });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageExpenses");
    const id = Number(req.nextUrl.searchParams.get("id"));
    await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
    await logAudit({ userId: session.userId, action: "delete", entity: "expense_category", entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
