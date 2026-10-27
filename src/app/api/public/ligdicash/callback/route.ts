import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ligdicashInvoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { refreshInvoice } from "@/lib/ligdicash";

/**
 * Rappel de LigdiCash après un paiement. Le contenu reçu n'est pas cru sur parole : seul le
 * jeton sert à retrouver la facture, dont l'état est ensuite redemandé à LigdiCash.
 */
export async function POST(req: NextRequest) {
  let token: string | null = null;
  try {
    const raw = await req.text();
    try {
      const json = JSON.parse(raw) as { token?: unknown; invoiceToken?: unknown };
      token = String(json.token ?? json.invoiceToken ?? "") || null;
    } catch {
      const form = new URLSearchParams(raw);
      token = form.get("token") ?? form.get("invoiceToken");
    }
  } catch {
    token = null;
  }
  if (!token) return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });

  try {
    const [invoice] = await db.select().from(ligdicashInvoices).where(eq(ligdicashInvoices.token, token)).limit(1);
    if (!invoice) return NextResponse.json({ error: "Facture inconnue" }, { status: 404 });
    const current = await refreshInvoice(invoice);
    return NextResponse.json({ status: current.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
