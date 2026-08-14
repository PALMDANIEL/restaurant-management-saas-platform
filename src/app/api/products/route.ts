import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { products, priceHistory } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ products: [] });
    const rows = await db.select().from(products).where(inArray(products.venueId, venueIds));
    return NextResponse.json({ products: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  categoryId: z.number().nullable().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().min(0),
  costPrice: z.number().min(0).default(0),
  unit: z.string().default("unité"),
  stockQuantity: z.number().min(0).default(0),
  stockAlertThreshold: z.number().min(0).default(5),
  barcode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageProducts");
    const body = createSchema.parse(await req.json());
    const [product] = await db
      .insert(products)
      .values({
        venueId: body.venueId,
        categoryId: body.categoryId ?? null,
        name: body.name,
        description: body.description,
        price: body.price,
        costPrice: body.costPrice,
        unit: body.unit,
        stockQuantity: String(body.stockQuantity),
        stockAlertThreshold: String(body.stockAlertThreshold),
        barcode: body.barcode,
      })
      .returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "product", entityId: product.id, details: body });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = createSchema.partial().extend({ id: z.number() });

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageProducts");
    const body = updateSchema.parse(await req.json());
    const { id, ...rest } = body;

    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });

    if (rest.price !== undefined && rest.price !== existing.price) {
      await db.insert(priceHistory).values({
        productId: id,
        oldPrice: existing.price,
        newPrice: rest.price,
        changedBy: session.userId,
      });
    }

    const updateValues: Record<string, unknown> = { ...rest };
    if (rest.stockQuantity !== undefined) updateValues.stockQuantity = String(rest.stockQuantity);
    if (rest.stockAlertThreshold !== undefined)
      updateValues.stockAlertThreshold = String(rest.stockAlertThreshold);

    const [updated] = await db
      .update(products)
      .set(updateValues)
      .where(eq(products.id, id))
      .returning();
    await logAudit({ userId: session.userId, venueId: updated.venueId, action: "update", entity: "product", entityId: id, details: rest });
    return NextResponse.json({ product: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageProducts");
    const id = Number(req.nextUrl.searchParams.get("id"));
    await db.update(products).set({ active: false }).where(eq(products.id, id));
    await logAudit({ userId: session.userId, action: "deactivate", entity: "product", entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
