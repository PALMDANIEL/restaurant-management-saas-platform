import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  orders,
  orderItems,
  products,
  users,
  restaurantTables,
  stockMovements,
  customers,
  payments,
  cashSessions,
} from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import {
  requireSession,
  getRequestVenueIds,
  handleApiError,
  logAudit,
  pushNotification,
} from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ orders: [] });

    const rows = await db
      .select()
      .from(orders)
      .where(inArray(orders.venueId, venueIds))
      .orderBy(desc(orders.createdAt))
      .limit(150);

    const orderIds = rows.map((o) => o.id);
    const items = orderIds.length
      ? await db
          .select({
            id: orderItems.id,
            orderId: orderItems.orderId,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            productName: products.name,
          })
          .from(orderItems)
          .innerJoin(products, eq(orderItems.productId, products.id))
          .where(inArray(orderItems.orderId, orderIds))
      : [];

    const serverIds = [...new Set(rows.map((o) => o.serverId).filter(Boolean))] as number[];
    const servers = serverIds.length
      ? await db.select().from(users).where(inArray(users.id, serverIds))
      : [];

    const tableIds = [...new Set(rows.map((o) => o.tableId).filter(Boolean))] as number[];
    const tables = tableIds.length
      ? await db.select().from(restaurantTables).where(inArray(restaurantTables.id, tableIds))
      : [];

    const enriched = rows.map((o) => ({
      ...o,
      items: items.filter((i) => i.orderId === o.id),
      serverName: servers.find((s) => s.id === o.serverId)
        ? `${servers.find((s) => s.id === o.serverId)!.firstName} ${servers.find((s) => s.id === o.serverId)!.lastName}`
        : null,
      tableNumber: tables.find((t) => t.id === o.tableId)?.number ?? null,
    }));

    return NextResponse.json({ orders: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}

const itemSchema = z.object({
  productId: z.number(),
  quantity: z.number().min(0.01),
  observations: z.string().optional(),
});

const createSchema = z.object({
  venueId: z.number(),
  tableId: z.number().nullable().optional(),
  serverId: z.number().nullable().optional(),
  customerId: z.number().nullable().optional(),
  notes: z.string().optional(),
  source: z.enum(["pos", "client_app"]).default("pos"),
  items: z.array(itemSchema).min(1),
  immediatePayment: z
    .object({ method: z.enum(["cash", "card", "mobile_money", "mixed"]), cashSessionId: z.number() })
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageOrders");
    const body = createSchema.parse(await req.json());

    if (body.immediatePayment) {
      const [cashSession] = await db
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.id, body.immediatePayment.cashSessionId))
        .limit(1);
      if (!cashSession || cashSession.venueId !== body.venueId) {
        return NextResponse.json({ error: "Session de caisse introuvable pour ce point de vente." }, { status: 400 });
      }
      if (cashSession.status !== "open") {
        return NextResponse.json({ error: "Cette session de caisse est fermée." }, { status: 400 });
      }
    }

    const productRows = await db
      .select()
      .from(products)
      .where(
        inArray(
          products.id,
          body.items.map((i) => i.productId)
        )
      );

    let total = 0;
    for (const item of body.items) {
      const p = productRows.find((pr) => pr.id === item.productId);
      if (!p) throw new Error("Produit introuvable");
      total += p.price * item.quantity;
    }

    const [order] = await db
      .insert(orders)
      .values({
        venueId: body.venueId,
        tableId: body.tableId ?? null,
        serverId: body.serverId ?? null,
        customerId: body.customerId ?? null,
        cashierId: session.role === "caissier" || session.role === "manager" ? session.userId : null,
        status: body.immediatePayment ? "paid" : "new",
        servedAt: body.immediatePayment ? new Date() : null,
        source: body.source,
        notes: body.notes,
        totalAmount: total,
      })
      .returning();

    for (const item of body.items) {
      const p = productRows.find((pr) => pr.id === item.productId)!;
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: item.productId,
        quantity: String(item.quantity),
        unitPrice: p.price,
        observations: item.observations,
      });

      const newQty = Math.max(0, Number(p.stockQuantity) - item.quantity);
      await db.update(products).set({ stockQuantity: String(newQty) }).where(eq(products.id, p.id));
      await db.insert(stockMovements).values({
        venueId: body.venueId,
        productId: p.id,
        type: "out",
        quantity: String(item.quantity),
        reason: `Commande #${order.id}`,
        referenceType: "order",
        referenceId: order.id,
        createdBy: session.userId,
      });

      if (newQty <= 0) {
        await pushNotification({
          venueId: body.venueId,
          type: "out_of_stock",
          title: "Rupture de stock",
          message: `${p.name} est en rupture de stock.`,
        });
      } else if (newQty <= Number(p.stockAlertThreshold)) {
        await pushNotification({
          venueId: body.venueId,
          type: "low_stock",
          title: "Stock faible",
          message: `${p.name} : il ne reste que ${newQty} ${p.unit}.`,
        });
      }
    }

    if (body.immediatePayment) {
      await db.insert(payments).values({
        orderId: order.id,
        venueId: body.venueId,
        cashSessionId: body.immediatePayment.cashSessionId,
        method: body.immediatePayment.method,
        amount: total,
        receivedBy: session.userId,
      });
      if (body.customerId) {
        const [c] = await db.select().from(customers).where(eq(customers.id, body.customerId)).limit(1);
        if (c) {
          await db
            .update(customers)
            .set({
              loyaltyPoints: c.loyaltyPoints + Math.floor(total / 1000),
              totalSpent: c.totalSpent + total,
            })
            .where(eq(customers.id, c.id));
        }
      }
      await pushNotification({
        venueId: body.venueId,
        type: "new_sale",
        title: "Nouvelle vente",
        message: `Vente de ${total} FCFA enregistrée.`,
      });
    } else {
      await pushNotification({
        venueId: body.venueId,
        type: "new_order",
        title: "Nouvelle commande",
        message: `Commande #${order.id}${body.tableId ? ` — Table ${body.tableId}` : ""} reçue.`,
      });
    }

    await logAudit({
      userId: session.userId,
      venueId: body.venueId,
      action: "create",
      entity: "order",
      entityId: order.id,
      details: { total, items: body.items.length },
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  status: z.enum(["new", "preparing", "served", "paid", "cancelled"]).optional(),
  serverId: z.number().nullable().optional(),
  paymentMethod: z.enum(["cash", "card", "mobile_money", "mixed"]).optional(),
  cashSessionId: z.number().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageOrders");
    const body = updateSchema.parse(await req.json());

    const [existing] = await db.select().from(orders).where(eq(orders.id, body.id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.serverId !== undefined) updates.serverId = body.serverId;

    if (body.status === "cancelled" && existing.status !== "cancelled") {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
      for (const item of items) {
        const [p] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
        if (p) {
          const newQty = Number(p.stockQuantity) + Number(item.quantity);
          await db.update(products).set({ stockQuantity: String(newQty) }).where(eq(products.id, p.id));
          await db.insert(stockMovements).values({
            venueId: existing.venueId,
            productId: p.id,
            type: "in",
            quantity: item.quantity,
            reason: `Annulation commande #${existing.id}`,
            referenceType: "order_cancel",
            referenceId: existing.id,
            createdBy: session.userId,
          });
        }
      }
      updates.status = "cancelled";
    } else if (body.status === "paid" && existing.status !== "paid") {
      if (!body.paymentMethod || !body.cashSessionId) {
        return NextResponse.json(
          { error: "Méthode de paiement et session de caisse requises pour encaisser." },
          { status: 400 }
        );
      }
      const [cashSession] = await db.select().from(cashSessions).where(eq(cashSessions.id, body.cashSessionId)).limit(1);
      if (!cashSession || cashSession.venueId !== existing.venueId) {
        return NextResponse.json({ error: "Session de caisse introuvable pour ce point de vente." }, { status: 400 });
      }
      if (cashSession.status !== "open") {
        return NextResponse.json({ error: "Cette session de caisse est fermée." }, { status: 400 });
      }
      await db.insert(payments).values({
        orderId: existing.id,
        venueId: existing.venueId,
        cashSessionId: body.cashSessionId,
        method: body.paymentMethod,
        amount: existing.totalAmount,
        receivedBy: session.userId,
      });
      if (existing.customerId) {
        const [c] = await db.select().from(customers).where(eq(customers.id, existing.customerId)).limit(1);
        if (c) {
          await db
            .update(customers)
            .set({
              loyaltyPoints: c.loyaltyPoints + Math.floor(existing.totalAmount / 1000),
              totalSpent: c.totalSpent + existing.totalAmount,
            })
            .where(eq(customers.id, c.id));
        }
      }
      await pushNotification({
        venueId: existing.venueId,
        type: "new_sale",
        title: "Nouvelle vente",
        message: `Commande #${existing.id} encaissée pour ${existing.totalAmount} FCFA.`,
      });
      updates.status = "paid";
    } else if (body.status) {
      updates.status = body.status;
      if (body.status === "served" && !existing.servedAt) {
        updates.servedAt = new Date();
      }
    }

    const [updated] = await db.update(orders).set(updates).where(eq(orders.id, body.id)).returning();

    await logAudit({
      userId: session.userId,
      venueId: existing.venueId,
      action: "update_status",
      entity: "order",
      entityId: body.id,
      details: updates,
    });

    return NextResponse.json({ order: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
