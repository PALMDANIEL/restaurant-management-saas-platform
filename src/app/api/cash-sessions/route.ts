import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cashSessions, payments } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ sessions: [] });
    const rows = await db
      .select()
      .from(cashSessions)
      .where(inArray(cashSessions.venueId, venueIds))
      .orderBy(desc(cashSessions.openedAt))
      .limit(50);
    return NextResponse.json({ sessions: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const openSchema = z.object({
  venueId: z.number(),
  openingAmount: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCashRegister");
    const body = openSchema.parse(await req.json());

    const [existingOpen] = await db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.venueId, body.venueId), eq(cashSessions.status, "open")))
      .limit(1);
    if (existingOpen) {
      return NextResponse.json({ error: "Une session de caisse est déjà ouverte pour ce point de vente." }, { status: 400 });
    }

    const [created] = await db
      .insert(cashSessions)
      .values({ venueId: body.venueId, openedBy: session.userId, openingAmount: body.openingAmount })
      .returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "open", entity: "cash_session", entityId: created.id, details: body });
    return NextResponse.json({ session: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const closeSchema = z.object({
  id: z.number(),
  closingAmount: z.number().min(0),
  notes: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCashRegister");
    const body = closeSchema.parse(await req.json());

    const [existing] = await db.select().from(cashSessions).where(eq(cashSessions.id, body.id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (existing.status === "closed") return NextResponse.json({ error: "Session déjà fermée" }, { status: 400 });

    const [cashTotal] = await db
      .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
      .from(payments)
      .where(and(eq(payments.cashSessionId, existing.id), eq(payments.method, "cash")));

    const expectedAmount = existing.openingAmount + (cashTotal?.total ?? 0);
    const difference = body.closingAmount - expectedAmount;

    const [updated] = await db
      .update(cashSessions)
      .set({
        status: "closed",
        closedBy: session.userId,
        closedAt: new Date(),
        closingAmount: body.closingAmount,
        expectedAmount,
        difference,
        notes: body.notes,
      })
      .where(eq(cashSessions.id, body.id))
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: existing.venueId,
      action: "close",
      entity: "cash_session",
      entityId: body.id,
      details: { expectedAmount, closingAmount: body.closingAmount, difference },
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
