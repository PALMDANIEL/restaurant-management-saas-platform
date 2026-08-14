import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  venues,
  restaurantTables,
  categories,
  products,
  orders,
  orderItems,
  stockMovements,
} from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { handleApiError, logAudit, pushNotification } from "@/lib/api-helpers";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    const tableId = Number(req.nextUrl.searchParams.get("tableId"));
    if (!venueId || !tableId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
    if (!venue || !venue.active) {
      return NextResponse.json({ error: "Ce point de vente n'est pas disponible." }, { status: 404 });
    }
    if (!venue.qrOrderingEnabled) {
      return NextResponse.json({ error: "La commande en ligne n'est pas activée pour ce point de vente." }, { status: 403 });
    }

    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.venueId, venueId)))
      .limit(1);
    if (!table) {
      return NextResponse.json({ error: "Table introuvable pour ce point de vente." }, { status: 404 });
    }

    const categoryRows = await db.select().from(categories).where(eq(categories.venueId, venueId));
    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        categoryId: products.categoryId,
        stockQuantity: products.stockQuantity,
        unit: products.unit,
        imageUrl: products.imageUrl,
      })
      .from(products)
      .where(and(eq(products.venueId, venueId), eq(products.active, true), gt(products.stockQuantity, "0")));

    return NextResponse.json({
      venue: { id: venue.id, name: venue.name },
      table: { id: table.id, number: table.number },
      categories: categoryRows,
      products: productRows,
    });
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
  tableId: z.number(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = createSchema.parse(await req.json());

    const [venue] = await db.select().from(venues).where(eq(venues.id, body.venueId)).limit(1);
    if (!venue || !venue.active || !venue.qrOrderingEnabled) {
      return NextResponse.json({ error: "Commande en ligne indisponible pour ce point de vente." }, { status: 403 });
    }
    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(and(eq(restaurantTables.id, body.tableId), eq(restaurantTables.venueId, body.venueId)))
      .limit(1);
    if (!table) return NextResponse.json({ error: "Table introuvable." }, { status: 404 });

    const productRows = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.venueId, body.venueId),
          eq(products.active, true)
        )
      );

    let total = 0;
    for (const item of body.items) {
      const p = productRows.find((pr) => pr.id === item.productId);
      if (!p) return NextResponse.json({ error: "Un des produits n'est plus disponible." }, { status: 400 });
      if (Number(p.stockQuantity) < item.quantity) {
        return NextResponse.json({ error: `Stock insuffisant pour ${p.name}.` }, { status: 400 });
      }
      total += p.price * item.quantity;
    }

    const notesParts: string[] = [];
    if (body.customerName) notesParts.push(`Client : ${body.customerName}`);
    if (body.customerPhone) notesParts.push(`Tél : ${body.customerPhone}`);

    const [order] = await db
      .insert(orders)
      .values({
        venueId: body.venueId,
        tableId: body.tableId,
        status: "new",
        source: "client_app",
        notes: notesParts.join(" · ") || undefined,
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
        reason: `Commande QR #${order.id} (Table ${table.number})`,
        referenceType: "order",
        referenceId: order.id,
      });
    }

    await pushNotification({
      venueId: body.venueId,
      type: "new_order",
      title: "Nouvelle commande via QR code",
      message: `Table ${table.number} — ${body.items.length} article(s), ${total.toLocaleString("fr-FR")} FCFA.`,
    });

    await logAudit({
      venueId: body.venueId,
      action: "create",
      entity: "order",
      entityId: order.id,
      details: { source: "client_app", total, tableId: body.tableId },
    });

    return NextResponse.json({ order: { id: order.id, totalAmount: total } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
