import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ expenses: [] });
    const rows = await db
      .select()
      .from(expenses)
      .where(inArray(expenses.venueId, venueIds))
      .orderBy(desc(expenses.expenseDate));
    return NextResponse.json({ expenses: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  category: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().min(1),
  expenseDate: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageExpenses");
    const body = createSchema.parse(await req.json());
    const [expense] = await db
      .insert(expenses)
      .values({ ...body, createdBy: session.userId })
      .returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "expense", entityId: expense.id, details: body });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageExpenses");
    const id = Number(req.nextUrl.searchParams.get("id"));
    await db.delete(expenses).where(eq(expenses.id, id));
    await logAudit({ userId: session.userId, action: "delete", entity: "expense", entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
