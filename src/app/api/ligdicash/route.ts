import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cashSessions, creditNotes, ligdicashInvoices, orders, venues } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession, handleApiError, assertVenueAccess, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { createCheckout, getLigdicashAccount, refreshInvoice } from "@/lib/ligdicash";

/** Adresse publique de l'application (LigdiCash doit pouvoir y renvoyer le client et le rappel). */
function appUrl(req: NextRequest) {
  return (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
}

function present(invoice: typeof ligdicashInvoices.$inferSelect) {
  return {
    id: invoice.id,
    orderId: invoice.orderId,
    amount: invoice.amount,
    status: invoice.status,
    paymentUrl: invoice.paymentUrl,
    operator: invoice.operator,
  };
}

const createSchema = z.object({
  orderId: z.number(),
  cashSessionId: z.number(),
  creditNoteCode: z.string().trim().min(1).optional(),
});

/** Crée une facture LigdiCash pour une commande non réglée ; renvoie le lien de paiement. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageOrders");
    const body = createSchema.parse(await req.json());

    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId)).limit(1);
    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    await assertVenueAccess(session, order.venueId);
    if (order.status === "paid" || order.status === "cancelled") {
      return NextResponse.json({ error: "Cette commande est déjà réglée ou annulée." }, { status: 400 });
    }

    const [cashSession] = await db.select().from(cashSessions).where(eq(cashSessions.id, body.cashSessionId)).limit(1);
    if (!cashSession || cashSession.venueId !== order.venueId) {
      return NextResponse.json({ error: "Session de caisse introuvable pour ce point de vente." }, { status: 400 });
    }
    if (cashSession.status !== "open") {
      return NextResponse.json({ error: "Cette session de caisse est fermée." }, { status: 400 });
    }

    const account = await getLigdicashAccount(order.venueId);
    if (!account) {
      return NextResponse.json(
        { error: "LigdiCash n'est pas configuré : renseignez les clés du compte marchand dans Paramètres." },
        { status: 400 }
      );
    }

    // L'avoir éventuel est vérifié maintenant mais n'est consommé qu'à la confirmation du paiement.
    let amount = order.totalAmount;
    let creditNoteCode: string | null = null;
    if (body.creditNoteCode) {
      creditNoteCode = body.creditNoteCode.toUpperCase();
      const [note] = await db.select().from(creditNotes).where(eq(creditNotes.code, creditNoteCode)).limit(1);
      if (!note) return NextResponse.json({ error: "Avoir introuvable. Vérifiez le code." }, { status: 400 });
      if (note.venueId !== order.venueId) {
        return NextResponse.json({ error: "Cet avoir n'est pas valable dans ce point de vente." }, { status: 400 });
      }
      if (note.status !== "active" || note.remainingAmount <= 0) {
        return NextResponse.json({ error: "Cet avoir n'est plus utilisable (déjà utilisé ou annulé)." }, { status: 400 });
      }
      amount -= Math.min(note.remainingAmount, amount);
    }
    if (amount <= 0) {
      return NextResponse.json({ error: "L'avoir couvre toute la commande : encaissez sans LigdiCash." }, { status: 400 });
    }

    // Une seule facture en attente par commande : la précédente est abandonnée.
    await db
      .update(ligdicashInvoices)
      .set({ status: "cancelled" })
      .where(and(eq(ligdicashInvoices.orderId, order.id), eq(ligdicashInvoices.status, "pending")));

    const [invoice] = await db
      .insert(ligdicashInvoices)
      .values({
        orderId: order.id,
        venueId: order.venueId,
        cashSessionId: cashSession.id,
        amount,
        creditNoteCode,
        createdBy: session.userId,
      })
      .returning();

    const [venue] = await db.select({ name: venues.name }).from(venues).where(eq(venues.id, order.venueId)).limit(1);
    const base = appUrl(req);
    let checkout: { token: string; url: string };
    try {
      checkout = await createCheckout(account, {
        invoiceId: invoice.id,
        amount,
        label: `Commande #${order.id}`,
        storeName: venue?.name ?? "Restaurant",
        siteUrl: base,
        returnUrl: `${base}/paiement?statut=retour&facture=${invoice.id}`,
        cancelUrl: `${base}/paiement?statut=annule&facture=${invoice.id}`,
        callbackUrl: `${base}/api/public/ligdicash/callback`,
      });
    } catch (e) {
      await db.update(ligdicashInvoices).set({ status: "failed" }).where(eq(ligdicashInvoices.id, invoice.id));
      throw e;
    }

    const [saved] = await db
      .update(ligdicashInvoices)
      .set({ token: checkout.token, paymentUrl: checkout.url })
      .where(eq(ligdicashInvoices.id, invoice.id))
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: order.venueId,
      action: "create",
      entity: "ligdicash_invoice",
      entityId: invoice.id,
      details: { orderId: order.id, amount },
    });

    return NextResponse.json({ invoice: present(saved) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

async function loadInvoice(req: NextRequest) {
  const session = await requireSession();
  assertCan(session.role, "manageOrders");
  const id = Number(req.nextUrl.searchParams.get("id"));
  const [invoice] = id
    ? await db.select().from(ligdicashInvoices).where(eq(ligdicashInvoices.id, id)).limit(1)
    : [];
  if (!invoice) return null;
  await assertVenueAccess(session, invoice.venueId);
  return invoice;
}

/** Suivi d'une facture : interroge LigdiCash tant qu'elle est en attente. */
export async function GET(req: NextRequest) {
  try {
    const invoice = await loadInvoice(req);
    if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    return NextResponse.json({ invoice: present(await refreshInvoice(invoice)) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Abandon côté caisse (le client ne paiera pas par LigdiCash). */
export async function DELETE(req: NextRequest) {
  try {
    const invoice = await loadInvoice(req);
    if (!invoice) return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    // Dernière vérification : si le client a payé entre-temps, on enregistre le paiement.
    const current = await refreshInvoice(invoice);
    if (current.status !== "pending") return NextResponse.json({ invoice: present(current) });
    const [cancelled] = await db
      .update(ligdicashInvoices)
      .set({ status: "cancelled" })
      .where(and(eq(ligdicashInvoices.id, invoice.id), eq(ligdicashInvoices.status, "pending")))
      .returning();
    return NextResponse.json({ invoice: present(cancelled ?? current) });
  } catch (error) {
    return handleApiError(error);
  }
}
