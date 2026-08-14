import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { supplierOrders, supplierOrderItems, suppliers, products, stockMovements } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ supplierOrders: [] });

    const rows = await db
      .select()
      .from(supplierOrders)
      .where(inArray(supplierOrders.venueId, venueIds))
      .orderBy(desc(supplierOrders.orderDate));

    const supplierIds = [...new Set(rows.map((r) => r.supplierId))];
    const supplierRows = supplierIds.length
      ? await db.select().from(suppliers).where(inArray(suppliers.id, supplierIds))
      : [];

    const orderIds = rows.map((r) => r.id);
    const items = orderIds.length
      ? await db.select().from(supplierOrderItems).where(inArray(supplierOrderItems.supplierOrderId, orderIds))
      : [];

    const enriched = rows.map((o) => ({
      ...o,
      supplierName: supplierRows.find((s) => s.id === o.supplierId)?.name ?? "—",
      items: items.filter((i) => i.supplierOrderId === o.id),
    }));

    return NextResponse.json({ supplierOrders: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}

const itemSchema = z.object({
  productId: z.number().nullable().optional(),
  description: z.string().optional(),
  quantity: z.number().min(0.01),
  unitCost: z.number().min(0),
});

const createSchema = z.object({
  venueId: z.number(),
  supplierId: z.number(),
  orderDate: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageSuppliers");
    const body = createSchema.parse(await req.json());

    const totalAmount = body.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

    const [order] = await db
      .insert(supplierOrders)
      .values({
        venueId: body.venueId,
        supplierId: body.supplierId,
        orderDate: body.orderDate,
        notes: body.notes,
        totalAmount,
        createdBy: session.userId,
      })
      .returning();

    for (const item of body.items) {
      await db.insert(supplierOrderItems).values({
        supplierOrderId: order.id,
        productId: item.productId ?? null,
        description: item.description,
        quantity: String(item.quantity),
        unitCost: item.unitCost,
      });
    }

    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "supplier_order", entityId: order.id, details: { totalAmount } });
    return NextResponse.json({ supplierOrder: order }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  status: z.enum(["pending", "received", "cancelled"]).optional(),
  paidAmount: z.number().min(0).optional(),
  receivedDate: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageSuppliers");
    const body = updateSchema.parse(await req.json());

    const [existing] = await db.select().from(supplierOrders).where(eq(supplierOrders.id, body.id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Commande fournisseur introuvable" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (body.paidAmount !== undefined) updates.paidAmount = body.paidAmount;

    if (body.status === "received" && existing.status !== "received") {
      const items = await db.select().from(supplierOrderItems).where(eq(supplierOrderItems.supplierOrderId, existing.id));
      for (const item of items) {
        if (!item.productId) continue;
        const [p] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (!p) continue;
        const newQty = Number(p.stockQuantity) + Number(item.quantity);
        await db.update(products).set({ stockQuantity: String(newQty) }).where(eq(products.id, p.id));
        await db.insert(stockMovements).values({
          venueId: existing.venueId,
          productId: p.id,
          type: "in",
          quantity: item.quantity,
          reason: `Réception commande fournisseur #${existing.id}`,
          referenceType: "supplier_order",
          referenceId: existing.id,
          createdBy: session.userId,
        });
      }
      updates.status = "received";
      updates.receivedDate = body.receivedDate ?? new Date().toISOString().slice(0, 10);
    } else if (body.status) {
      updates.status = body.status;
    }

    const [updated] = await db.update(supplierOrders).set(updates).where(eq(supplierOrders.id, body.id)).returning();
    await logAudit({ userId: session.userId, venueId: existing.venueId, action: "update", entity: "supplier_order", entityId: body.id, details: updates });
    return NextResponse.json({ supplierOrder: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
