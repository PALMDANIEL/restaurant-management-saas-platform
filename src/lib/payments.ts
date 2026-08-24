import { db } from "@/db";
import { payments, creditNotes } from "@/db/schema";
import { eq } from "drizzle-orm";

export type PaymentMethod = "cash" | "card" | "mobile_money" | "mixed";

export type SettlePaymentInput = {
  orderId: number;
  venueId: number;
  /** Montant total à couvrir par ce règlement (le total de la commande). */
  total: number;
  cashSessionId: number;
  method: PaymentMethod;
  /** Espèces tendues par le client (paiements en cash uniquement). */
  amountReceived?: number | null;
  /** Que faire si le client a trop payé en espèces : rendre la monnaie, ou émettre un avoir. */
  changeAction?: "cash" | "credit_note";
  /** Code d'un avoir à utiliser (en tout ou partie) pour ce règlement. */
  creditNoteCode?: string | null;
  /** Client à associer à un avoir émis pour manque de monnaie (optionnel). */
  changeCustomerId?: number | null;
  receivedBy: number | null;
};

export type SettlePaymentResult = {
  creditNoteIssued: typeof creditNotes.$inferSelect | null;
  creditNoteRedeemed: (typeof creditNotes.$inferSelect) | null;
};

/** Génère un code d'avoir unique du type AV-XXXXXX. */
async function generateCreditNoteCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = `AV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [exists] = await db
      .select({ id: creditNotes.id })
      .from(creditNotes)
      .where(eq(creditNotes.code, candidate))
      .limit(1);
    if (!exists) return candidate;
  }
  throw new Error("Impossible de générer un code d'avoir unique, réessayez.");
}

/**
 * Règle une commande : applique d'abord un éventuel avoir (creditNoteCode), puis couvre le
 * reste avec la méthode de paiement choisie. Si le paiement est en espèces et que le client
 * tend plus que dû, gère la monnaie soit en espèces, soit en émettant un nouvel avoir (cas
 * d'un manque de monnaie en caisse).
 *
 * Crée une ou deux lignes dans `payments` (une par avoir utilisé, une pour le reste), dont la
 * somme des montants `amount` est toujours égale à `total` (sûr pour le calcul du CA).
 */
export async function settleOrderPayment(input: SettlePaymentInput): Promise<SettlePaymentResult> {
  let remaining = input.total;
  let creditNoteRedeemed: typeof creditNotes.$inferSelect | null = null;

  if (input.creditNoteCode && input.creditNoteCode.trim()) {
    const code = input.creditNoteCode.trim().toUpperCase();
    const [note] = await db.select().from(creditNotes).where(eq(creditNotes.code, code)).limit(1);
    if (!note) throw new Error("Avoir introuvable. Vérifiez le code.");
    if (note.venueId !== input.venueId) {
      throw new Error("Cet avoir n'est pas valable dans ce point de vente.");
    }
    if (note.status !== "active" || note.remainingAmount <= 0) {
      throw new Error("Cet avoir n'est plus utilisable (déjà utilisé ou annulé).");
    }

    const applied = Math.min(note.remainingAmount, remaining);
    if (applied > 0) {
      await db.insert(payments).values({
        orderId: input.orderId,
        venueId: input.venueId,
        cashSessionId: input.cashSessionId,
        method: "credit_note",
        amount: applied,
        creditNoteRedeemedId: note.id,
        receivedBy: input.receivedBy,
      });

      const newRemainingOnNote = note.remainingAmount - applied;
      await db
        .update(creditNotes)
        .set({
          remainingAmount: newRemainingOnNote,
          status: newRemainingOnNote <= 0 ? "used" : "active",
          usedAt: newRemainingOnNote <= 0 ? new Date() : note.usedAt,
        })
        .where(eq(creditNotes.id, note.id));

      remaining -= applied;
      creditNoteRedeemed = { ...note, remainingAmount: newRemainingOnNote };
    }
  }

  let creditNoteIssued: typeof creditNotes.$inferSelect | null = null;

  if (remaining > 0) {
    let amountReceivedVal: number | null = null;
    let changeGivenVal: number | null = null;

    if (input.method === "cash" && input.amountReceived != null) {
      amountReceivedVal = input.amountReceived;
      if (amountReceivedVal < remaining) {
        throw new Error("Le montant reçu est inférieur au montant restant à payer.");
      }
      const changeDue = amountReceivedVal - remaining;
      if (changeDue > 0 && input.changeAction === "credit_note") {
        // Manque de monnaie : on garde tout l'argent reçu en caisse et on émet un avoir
        // pour la différence, à faire valoir lors d'un prochain passage du client.
        const code = await generateCreditNoteCode();
        const [note] = await db
          .insert(creditNotes)
          .values({
            venueId: input.venueId,
            customerId: input.changeCustomerId ?? null,
            code,
            orderId: input.orderId,
            cashSessionId: input.cashSessionId,
            amount: changeDue,
            remainingAmount: changeDue,
            reason: "Monnaie non disponible à l'encaissement",
            issuedBy: input.receivedBy,
          })
          .returning();
        creditNoteIssued = note;
        changeGivenVal = 0;
      } else {
        changeGivenVal = changeDue;
      }
    }

    await db.insert(payments).values({
      orderId: input.orderId,
      venueId: input.venueId,
      cashSessionId: input.cashSessionId,
      method: input.method,
      amount: remaining,
      amountReceived: amountReceivedVal,
      changeGiven: changeGivenVal,
      creditNoteIssuedId: creditNoteIssued?.id ?? null,
      receivedBy: input.receivedBy,
    });
  }

  return { creditNoteIssued, creditNoteRedeemed };
}
