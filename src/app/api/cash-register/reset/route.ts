import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashSessions, creditNotes, ligdicashInvoices, orders, payments } from "@/db/schema";
import { assertVenueAccess, handleApiError, logAudit, requireSession } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";

const schema = z.object({
  venueId: z.number(),
  confirmation: z.literal("REINITIALISER"),
});

/**
 * Remet à zéro la caisse d'un point de vente : efface ses commandes (avec leurs lignes),
 * paiements, avoirs, factures LigdiCash et sessions de caisse. Sert à effacer les ventes
 * d'essai avant l'ouverture réelle. Irréversible ; garde un trace dans le journal d'audit.
 * Ne touche ni aux produits, ni au stock, ni aux clients, ni aux comptes.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "resetCashRegister");
    const body = schema.parse(await req.json());
    await assertVenueAccess(session, body.venueId);
    const v = body.venueId;

    const [[o], [p], [c], [s]] = await Promise.all([
      db.select({ n: count() }).from(orders).where(eq(orders.venueId, v)),
      db.select({ n: count() }).from(payments).where(eq(payments.venueId, v)),
      db.select({ n: count() }).from(creditNotes).where(eq(creditNotes.venueId, v)),
      db.select({ n: count() }).from(cashSessions).where(eq(cashSessions.venueId, v)),
    ]);

    // Pas de transaction (pilote HTTP de Neon) : de l'enfant vers le parent, chaque étape
    // peut être relancée sans risque si la précédente a été interrompue.
    await db.delete(ligdicashInvoices).where(eq(ligdicashInvoices.venueId, v));
    await db.delete(payments).where(eq(payments.venueId, v));
    await db.delete(creditNotes).where(eq(creditNotes.venueId, v));
    await db.delete(orders).where(eq(orders.venueId, v)); // lignes de commande en cascade
    await db.delete(cashSessions).where(eq(cashSessions.venueId, v));

    const resume = { commandes: o.n, paiements: p.n, avoirs: c.n, sessions: s.n };
    await logAudit({
      userId: session.userId,
      venueId: v,
      action: "reset",
      entity: "cash_register",
      details: resume,
    });
    return NextResponse.json({ ok: true, supprime: resume });
  } catch (error) {
    return handleApiError(error);
  }
}
