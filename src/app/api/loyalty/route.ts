import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, loyaltyTransactions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireSession, handleApiError, logAudit, pushNotification } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

/** 1 loyalty point earned per 500 FCFA spent. */
export const FCFA_PER_POINT = 500;

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const customerId = Number(req.nextUrl.searchParams.get("customerId"));
    if (!customerId) return NextResponse.json({ error: "customerId requis" }, { status: 400 });
    const rows = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, customerId))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(100);
    return NextResponse.json({ transactions: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.object({
  customerId: z.number(),
  type: z.enum(["earn", "redeem", "adjustment"]),
  amountSpent: z.number().min(0).optional(),
  points: z.number().optional(),
  orderId: z.number().optional(),
  note: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCustomers");
    const body = postSchema.parse(await req.json());

    const [customer] = await db.select().from(customers).where(eq(customers.id, body.customerId)).limit(1);
    if (!customer) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

    let points: number;
    if (body.type === "earn") {
      points = body.points ?? Math.floor((body.amountSpent ?? 0) / FCFA_PER_POINT);
      if (points <= 0) return NextResponse.json({ error: "Aucun point à attribuer" }, { status: 400 });
    } else if (body.type === "redeem") {
      points = body.points ?? 0;
      if (points <= 0) return NextResponse.json({ error: "Nombre de points invalide" }, { status: 400 });
      if (points > customer.loyaltyPoints) {
        return NextResponse.json({ error: "Solde de points insuffisant" }, { status: 400 });
      }
    } else {
      points = body.points ?? 0;
    }

    const delta = body.type === "redeem" ? -Math.abs(points) : points;
    const newBalance = customer.loyaltyPoints + delta;

    const [updated] = await db
      .update(customers)
      .set({
        loyaltyPoints: newBalance,
        totalSpent: body.type === "earn" && body.amountSpent ? customer.totalSpent + body.amountSpent : customer.totalSpent,
      })
      .where(eq(customers.id, customer.id))
      .returning();

    const [txn] = await db
      .insert(loyaltyTransactions)
      .values({
        customerId: customer.id,
        type: body.type,
        points: delta,
        orderId: body.orderId ?? null,
        note: body.note,
        createdBy: session.userId,
      })
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: customer.venueId,
      action: body.type,
      entity: "loyalty",
      entityId: customer.id,
      details: { points: delta, note: body.note },
    });

    if (body.type === "earn") {
      await pushNotification({
        venueId: customer.venueId,
        type: "system",
        title: "Points de fidélité attribués",
        message: `${customer.name} a gagné ${points} point(s) (solde: ${newBalance}).`,
      });
    }

    return NextResponse.json({ customer: updated, transaction: txn });
  } catch (error) {
    return handleApiError(error);
  }
}
