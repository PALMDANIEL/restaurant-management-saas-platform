import { db } from "@/db";
import { companies, customers, ligdicashInvoices, orders, venues } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { pushNotification } from "./api-helpers";
import { settleOrderPayment } from "./payments";

/**
 * LigdiCash (ligdicash.com) : paiement Orange Money / Moov Money par page de paiement.
 * Chaque entreprise renseigne son propre compte marchand (Paramètres) : l'argent arrive
 * directement chez elle. La plateforme ne fait que créer la facture et constater le paiement.
 */

const LIVE_URL = "https://app.ligdicash.com/pay/v01/";
const TEST_URL = "https://test.ligdicash.com/pay/v01/";

export type LigdicashAccount = { apiKey: string; authToken: string; live: boolean };

type Company = typeof companies.$inferSelect;

/** Retire les clés LigdiCash d'une ligne `companies` avant de l'envoyer au navigateur. */
export function withoutSecrets<T extends Partial<Company>>(company: T) {
  const { ligdicashApiKey, ligdicashAuthToken, ...rest } = company;
  return { ...rest, ligdicashConfigured: !!(ligdicashApiKey && ligdicashAuthToken) };
}

export async function getLigdicashAccount(venueId: number): Promise<LigdicashAccount | null> {
  const [row] = await db
    .select({
      apiKey: companies.ligdicashApiKey,
      authToken: companies.ligdicashAuthToken,
      live: companies.ligdicashLive,
    })
    .from(venues)
    .innerJoin(companies, eq(venues.companyId, companies.id))
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!row?.apiKey || !row.authToken) return null;
  return { apiKey: row.apiKey, authToken: row.authToken, live: row.live };
}

async function call<T>(account: LigdicashAccount, path: string, init: RequestInit): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${account.live ? LIVE_URL : TEST_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Apikey: account.apiKey,
        Authorization: `Bearer ${account.authToken}`,
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new Error("LigdiCash ne répond pas. Réessayez dans quelques instants.");
  }
  return (await res.json().catch(() => null)) as T | null;
}

export async function createCheckout(
  account: LigdicashAccount,
  r: {
    invoiceId: number;
    amount: number;
    label: string;
    storeName: string;
    siteUrl: string;
    returnUrl: string;
    cancelUrl: string;
    callbackUrl: string;
  }
): Promise<{ token: string; url: string }> {
  const body = await call<{ response_code?: string; token?: string; response_text?: string; description?: string }>(
    account,
    "redirect/checkout-invoice/create",
    {
      method: "POST",
      body: JSON.stringify({
        commande: {
          invoice: {
            items: [{ name: r.label, description: r.label, quantity: 1, unit_price: r.amount, total_price: r.amount }],
            total_amount: r.amount,
            devise: "XOF",
            description: r.label,
            customer: "",
            customer_firstname: "",
            customer_lastname: "",
            customer_email: "",
            external_id: String(r.invoiceId),
            otp: "",
          },
          store: { name: r.storeName, website_url: r.siteUrl },
          actions: { cancel_url: r.cancelUrl, return_url: r.returnUrl, callback_url: r.callbackUrl },
          custom_data: { facture: String(r.invoiceId) },
        },
      }),
    }
  );
  if (body?.response_code !== "00" || !body.token || !body.response_text) {
    throw new Error(`LigdiCash a refusé la facture${body?.description ? ` : ${body.description}` : ""}.`);
  }
  return { token: body.token, url: body.response_text };
}

export async function checkInvoice(
  account: LigdicashAccount,
  token: string
): Promise<{ state: "paid" | "pending" | "failed"; amount: number | null; operator: string | null }> {
  const body = await call<{
    response_code?: string;
    status?: string;
    montant?: number | string;
    amount?: number | string;
    operator_name?: string;
  }>(account, `redirect/checkout-invoice/confirm/?invoiceToken=${encodeURIComponent(token)}`, { method: "GET" });
  const amount = Number(body?.montant ?? body?.amount ?? NaN);
  const state =
    body?.response_code === "00" && body.status === "completed"
      ? "paid"
      : body?.status === "nocompleted"
        ? "failed"
        : "pending";
  return { state, amount: Number.isFinite(amount) ? amount : null, operator: body?.operator_name ?? null };
}

type Invoice = typeof ligdicashInvoices.$inferSelect;

/** Une facture abandonnée à la caisse reste payable par le client qui a gardé le lien. */
const OPEN_STATUSES = ["pending", "cancelled"] as const;

/**
 * Interroge LigdiCash pour une facture non payée et, si elle l'est, règle la commande.
 * Appelée par le rappel de LigdiCash et par le suivi à l'écran : l'UPDATE conditionnel
 * (statut encore ouvert) garantit qu'un paiement n'est enregistré qu'une seule fois.
 */
export async function refreshInvoice(invoice: Invoice): Promise<Invoice> {
  if (!(OPEN_STATUSES as readonly string[]).includes(invoice.status) || !invoice.token) return invoice;
  const account = await getLigdicashAccount(invoice.venueId);
  if (!account) return invoice;

  const result = await checkInvoice(account, invoice.token);
  if (result.state === "pending") return invoice;

  if (result.state === "failed") {
    if (invoice.status !== "pending") return invoice;
    const [failed] = await db
      .update(ligdicashInvoices)
      .set({ status: "failed" })
      .where(and(eq(ligdicashInvoices.id, invoice.id), eq(ligdicashInvoices.status, "pending")))
      .returning();
    return failed ?? invoice;
  }

  if (result.amount != null && result.amount < invoice.amount) {
    // Ne devrait pas arriver (le montant est fixé à la création) : on n'encaisse pas.
    await pushNotification({
      venueId: invoice.venueId,
      type: "system",
      title: "Paiement LigdiCash à vérifier",
      message: `Commande #${invoice.orderId} : ${result.amount} FCFA reçus au lieu de ${invoice.amount} FCFA.`,
    });
    return invoice;
  }

  const [claimed] = await db
    .update(ligdicashInvoices)
    .set({ status: "paid", paidAt: new Date(), operator: result.operator })
    .where(and(eq(ligdicashInvoices.id, invoice.id), inArray(ligdicashInvoices.status, [...OPEN_STATUSES])))
    .returning();
  if (!claimed) {
    const [current] = await db.select().from(ligdicashInvoices).where(eq(ligdicashInvoices.id, invoice.id)).limit(1);
    return current ?? invoice;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, claimed.orderId)).limit(1);
  if (!order || order.status === "paid" || order.status === "cancelled") {
    await pushNotification({
      venueId: claimed.venueId,
      type: "system",
      title: "Paiement LigdiCash en trop",
      message: `Commande #${claimed.orderId} déjà ${order?.status === "cancelled" ? "annulée" : "réglée"} : ${claimed.amount} FCFA reçus par LigdiCash, à rembourser au client.`,
    });
    return claimed;
  }

  try {
    await settleOrderPayment({
      orderId: order.id,
      venueId: order.venueId,
      total: order.totalAmount,
      cashSessionId: claimed.cashSessionId,
      method: "ligdicash",
      creditNoteCode: claimed.creditNoteCode,
      receivedBy: claimed.createdBy,
    });
  } catch (e) {
    // Typiquement : l'avoir prévu a été utilisé ailleurs entre-temps. L'argent est reçu,
    // la commande reste à régler à la main.
    await pushNotification({
      venueId: order.venueId,
      type: "system",
      title: "Paiement LigdiCash à vérifier",
      message: `Commande #${order.id} : ${claimed.amount} FCFA reçus par LigdiCash mais non enregistrés (${(e as Error).message}).`,
    });
    return claimed;
  }
  await db
    .update(orders)
    .set({ status: "paid", servedAt: order.servedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  if (order.customerId) {
    const [c] = await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
    if (c) {
      await db
        .update(customers)
        .set({
          loyaltyPoints: c.loyaltyPoints + Math.floor(order.totalAmount / 1000),
          totalSpent: c.totalSpent + order.totalAmount,
        })
        .where(eq(customers.id, c.id));
    }
  }
  await pushNotification({
    venueId: order.venueId,
    type: "new_sale",
    title: "Paiement LigdiCash reçu",
    message: `Commande #${order.id} réglée par ${result.operator ?? "LigdiCash"} (${claimed.amount} FCFA).`,
  });
  return claimed;
}
