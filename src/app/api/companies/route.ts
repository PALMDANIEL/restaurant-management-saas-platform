import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies, venues, products, orderItems } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireSession, handleApiError, logAudit, auditUserId } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET() {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCompanies");
    const rows = await db.select().from(companies);
    return NextResponse.json({ companies: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Le slug ne doit contenir que des minuscules, chiffres et tirets"),
  currency: z.string().default("XOF"),
  licenseStatus: z.enum(["active", "suspended", "expired"]).default("active"),
  licenseExpiresAt: z.string().datetime().nullable().optional(),
  maxUsers: z.number().int().positive().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCompanies");
    const body = createSchema.parse(await req.json());
    const { licenseExpiresAt, ...rest } = body;
    const [company] = await db
      .insert(companies)
      .values({
        ...rest,
        licenseExpiresAt: licenseExpiresAt ? new Date(licenseExpiresAt) : null,
      })
      .returning();
    await logAudit({ userId: auditUserId(session), action: "create", entity: "company", entityId: company.id, details: body });
    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  currency: z.string().optional(),
  licenseStatus: z.enum(["active", "suspended", "expired"]).optional(),
  licenseExpiresAt: z.string().datetime().nullable().optional(),
  maxUsers: z.number().int().positive().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCompanies");
    const body = updateSchema.parse(await req.json());
    const { id, licenseExpiresAt, ...rest } = body;
    const updates = {
      ...rest,
      ...(licenseExpiresAt !== undefined && {
        licenseExpiresAt: licenseExpiresAt ? new Date(licenseExpiresAt) : null,
      }),
    };
    const [updated] = await db.update(companies).set(updates).where(eq(companies.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    await logAudit({ userId: auditUserId(session), action: "update", entity: "company", entityId: id, details: updates });
    return NextResponse.json({ company: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  id: z.number(),
  confirmName: z.string().min(1),
});

/**
 * Suppression définitive d'une entreprise. Réservé au platform_admin.
 * ATTENTION : companies -> venues -> users (et tout ce qui en dépend : produits, commandes,
 * stock, etc.) est configuré en CASCADE au niveau base de données. Supprimer une entreprise
 * supprime donc irréversiblement toutes ses données. On exige que le nom exact soit renvoyé
 * en confirmation pour éviter une suppression accidentelle.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageCompanies");
    const body = deleteSchema.parse(await req.json());

    const [company] = await db.select().from(companies).where(eq(companies.id, body.id)).limit(1);
    if (!company) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    if (company.name.trim().toLowerCase() !== body.confirmName.trim().toLowerCase()) {
      return NextResponse.json(
        { error: "Le nom saisi ne correspond pas au nom de l'entreprise" },
        { status: 400 }
      );
    }

    // order_items.productId est en RESTRICT (protection normale contre la suppression d'un
    // produit ayant déjà des commandes). On vide donc explicitement ces lignes en premier,
    // pour cette entreprise uniquement, afin que le cascade companies -> venues -> products
    // puisse ensuite aller jusqu'au bout.
    // (Pas de db.transaction ici : le driver HTTP de Neon ne supporte pas les transactions
    // interactives multi-requêtes — on enchaîne donc les suppressions directement.)
    const companyVenues = await db.select({ id: venues.id }).from(venues).where(eq(venues.companyId, body.id));
    const venueIds = companyVenues.map((v) => v.id);

    if (venueIds.length) {
      const companyProducts = await db
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.venueId, venueIds));
      const productIds = companyProducts.map((p) => p.id);

      if (productIds.length) {
        await db.delete(orderItems).where(inArray(orderItems.productId, productIds));
      }
    }

    await db.delete(companies).where(eq(companies.id, body.id));

    await logAudit({
      userId: auditUserId(session),
      action: "delete",
      entity: "company",
      entityId: body.id,
      details: { name: company.name, slug: company.slug },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
