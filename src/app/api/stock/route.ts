import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stockMovements, products } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit, pushNotification } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ movements: [] });
    const rows = await db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        createdAt: stockMovements.createdAt,
        productName: products.name,
        productId: products.id,
        venueId: stockMovements.venueId,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .where(inArray(stockMovements.venueId, venueIds))
      .orderBy(desc(stockMovements.createdAt))
      .limit(200);
    return NextResponse.json({ movements: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  venueId: z.number(),
  productId: z.number(),
  type: z.enum(["in", "out", "adjustment", "loss"]),
  quantity: z.number(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageStock");
    const body = schema.parse(await req.json());

    const [product] = await db.select().from(products).where(eq(products.id, body.productId)).limit(1);
    if (!product) return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });

    let newQuantity = Number(product.stockQuantity);
    if (body.type === "in") newQuantity += body.quantity;
    else newQuantity -= body.quantity;
    if (newQuantity < 0) newQuantity = 0;

    await db.insert(stockMovements).values({
      venueId: body.venueId,
      productId: body.productId,
      type: body.type,
      quantity: String(body.quantity),
      reason: body.reason,
      createdBy: session.userId,
    });

    await db.update(products).set({ stockQuantity: String(newQuantity) }).where(eq(products.id, body.productId));

    if (newQuantity <= 0) {
      await pushNotification({
        venueId: body.venueId,
        type: "out_of_stock",
        title: "Rupture de stock",
        message: `${product.name} est en rupture de stock.`,
      });
    } else if (newQuantity <= Number(product.stockAlertThreshold)) {
      await pushNotification({
        venueId: body.venueId,
        type: "low_stock",
        title: "Stock faible",
        message: `${product.name} : il ne reste que ${newQuantity} ${product.unit}.`,
      });
    }

    await logAudit({ userId: session.userId, venueId: body.venueId, action: "stock_movement", entity: "product", entityId: body.productId, details: body });

    return NextResponse.json({ success: true, newQuantity });
  } catch (error) {
    return handleApiError(error);
  }
}
