import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creditNotes, customers, users, orders } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, assertVenueAccess, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

async function generateCreditNoteCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = `AV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [exists] = await db
      .select({ id: creditNotes.id })
      .from(creditNotes)
      .where(eq(creditNotes.code, candidate))
      .limit(1);
    if (!exists) return candidate;
  }
  throw new Error("Impossible de générer un code d'avoir unique, réessayez.");
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ creditNotes: [] });

    const statusFilter = req.nextUrl.searchParams.get("status");
    const customerIdFilter = req.nextUrl.searchParams.get("customerId");
    const conditions = [inArray(creditNotes.venueId, venueIds)];
    if (statusFilter && ["active", "used", "cancelled"].includes(statusFilter)) {
      conditions.push(eq(creditNotes.status, statusFilter as "active" | "used" | "cancelled"));
    }
    if (customerIdFilter) {
      conditions.push(eq(creditNotes.customerId, Number(customerIdFilter)));
    }

    const rows = await db
      .select()
      .from(creditNotes)
      .where(and(...conditions))
      .orderBy(desc(creditNotes.createdAt))
      .limit(200);

    const customerIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))] as number[];
    const customerRows = customerIds.length
      ? await db.select().from(customers).where(inArray(customers.id, customerIds))
      : [];

    const issuerIds = [...new Set(rows.map((r) => r.issuedBy).filter(Boolean))] as number[];
    const issuerRows = issuerIds.length
      ? await db.select().from(users).where(inArray(users.id, issuerIds))
      : [];

    const enriched = rows.map((r) => ({
      ...r,
      customerName: customerRows.find((c) => c.id === r.customerId)?.name ?? null,
      issuedByName: (() => {
        const u = issuerRows.find((u) => u.id === r.issuedBy);
        return u ? `${u.firstName} ${u.lastName}` : null;
      })(),
    }));

    return NextResponse.json({ creditNotes: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  customerId: z.number().nullable().optional(),
  amount: z.number().min(1),
  reason: z.string().min(1),
  orderId: z.number().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCreditNotes");
    const body = createSchema.parse(await req.json());
    await assertVenueAccess(session, body.venueId);

    if (body.orderId) {
      const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId)).limit(1);
      if (!order || order.venueId !== body.venueId) {
        return NextResponse.json({ error: "Commande introuvable pour ce point de vente." }, { status: 400 });
      }
    }

    const code = await generateCreditNoteCode();
    const [note] = await db
      .insert(creditNotes)
      .values({
        venueId: body.venueId,
        customerId: body.customerId ?? null,
        code,
        orderId: body.orderId ?? null,
        amount: body.amount,
        remainingAmount: body.amount,
        reason: body.reason,
        issuedBy: session.userId,
      })
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: body.venueId,
      action: "create",
      entity: "credit_note",
      entityId: note.id,
      details: { amount: body.amount, reason: body.reason },
    });

    return NextResponse.json({ creditNote: note }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  status: z.enum(["cancelled"]),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCreditNotes");
    const body = updateSchema.parse(await req.json());

    const [existing] = await db.select().from(creditNotes).where(eq(creditNotes.id, body.id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Avoir introuvable" }, { status: 404 });
    await assertVenueAccess(session, existing.venueId);
    if (existing.status !== "active") {
      return NextResponse.json({ error: "Seul un avoir actif peut être annulé." }, { status: 400 });
    }

    const [updated] = await db
      .update(creditNotes)
      .set({ status: "cancelled" })
      .where(eq(creditNotes.id, body.id))
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: existing.venueId,
      action: "cancel",
      entity: "credit_note",
      entityId: body.id,
      details: { remainingAmount: existing.remainingAmount },
    });

    return NextResponse.json({ creditNote: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
