import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  attendanceRecords,
  cashSessions,
  categories,
  creditNotes,
  customers,
  expenses,
  ligdicashInvoices,
  notifications,
  orders,
  payments,
  products,
  promotions,
  reservations,
  restaurantTables,
  staffBehaviorRatings,
  stockMovements,
  supplierOrders,
  suppliers,
} from "@/db/schema";
import { assertVenueAccess, handleApiError, logAudit, requireSession } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";

const schema = z.object({
  venueId: z.number(),
  confirmation: z.literal("TOUT EFFACER"),
});

/**
 * Remet un point de vente à zéro, comme un maquis tout neuf : efface ventes, paiements,
 * avoirs, sessions de caisse, produits, catégories, stock, tables, réservations, clients et
 * points de fidélité, dépenses, fournisseurs, pointages et notes du personnel, notifications.
 *
 * Conserve : l'entreprise, le point de vente (nom, adresse), les comptes et leurs
 * affectations, les horaires d'équipes, les règles de notation et le journal d'audit.
 * Irréversible. Réservé au propriétaire et au gérant ; trace gardée dans le journal d'audit.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "resetCashRegister");
    const body = schema.parse(await req.json());
    await assertVenueAccess(session, body.venueId);
    const v = body.venueId;

    const nb = async (table: any, col: any) =>
      (await db.select({ n: count() }).from(table).where(eq(col, v)))[0].n;
    const resume = {
      commandes: await nb(orders, orders.venueId),
      paiements: await nb(payments, payments.venueId),
      sessions: await nb(cashSessions, cashSessions.venueId),
      produits: await nb(products, products.venueId),
      categories: await nb(categories, categories.venueId),
      tables: await nb(restaurantTables, restaurantTables.venueId),
      clients: await nb(customers, customers.venueId),
      depenses: await nb(expenses, expenses.venueId),
      fournisseurs: await nb(suppliers, suppliers.venueId),
    };

    // Pas de transaction (pilote HTTP de Neon) : des enfants vers les parents, chaque étape
    // peut être relancée sans risque si la précédente a été interrompue.
    await db.delete(ligdicashInvoices).where(eq(ligdicashInvoices.venueId, v));
    await db.delete(payments).where(eq(payments.venueId, v));
    await db.delete(creditNotes).where(eq(creditNotes.venueId, v));
    await db.delete(orders).where(eq(orders.venueId, v)); // lignes de commande en cascade
    await db.delete(cashSessions).where(eq(cashSessions.venueId, v));
    await db.delete(reservations).where(eq(reservations.venueId, v));
    await db.delete(customers).where(eq(customers.venueId, v)); // points de fidélité en cascade
    await db.delete(expenses).where(eq(expenses.venueId, v));
    await db.delete(supplierOrders).where(eq(supplierOrders.venueId, v)); // lignes en cascade
    await db.delete(suppliers).where(eq(suppliers.venueId, v));
    await db.delete(promotions).where(eq(promotions.venueId, v));
    await db.delete(stockMovements).where(eq(stockMovements.venueId, v));
    await db.delete(products).where(eq(products.venueId, v));
    await db.delete(categories).where(eq(categories.venueId, v));
    await db.delete(restaurantTables).where(eq(restaurantTables.venueId, v));
    await db.delete(attendanceRecords).where(eq(attendanceRecords.venueId, v));
    await db.delete(staffBehaviorRatings).where(eq(staffBehaviorRatings.venueId, v));
    await db.delete(notifications).where(eq(notifications.venueId, v));

    await logAudit({
      userId: session.userId,
      venueId: v,
      action: "reset",
      entity: "venue",
      entityId: v,
      details: resume,
    });
    return NextResponse.json({ ok: true, supprime: resume });
  } catch (error) {
    return handleApiError(error);
  }
}
