import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments, orders, orderItems, products, expenses, customers, cashSessions } from "@/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

function formatFcfa(n: number) {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const d = startOfToday();
  d.setDate(1);
  return d;
}

const INTENTS = [
  { key: "revenue_today", keywords: ["chiffre d'affaires aujourd'hui", "vente aujourd'hui", "ca aujourd'hui", "recette du jour"] },
  { key: "revenue_month", keywords: ["chiffre d'affaires du mois", "ca du mois", "vente du mois", "recette du mois"] },
  { key: "top_products", keywords: ["produit qui se vend", "meilleur produit", "top produit", "plus vendu"] },
  { key: "low_stock", keywords: ["stock bas", "rupture", "réapprovisionner", "stock faible"] },
  { key: "expenses_month", keywords: ["dépense", "charge du mois"] },
  { key: "top_customers", keywords: ["meilleur client", "client fidèle", "top client"] },
  { key: "cash_status", keywords: ["caisse", "session de caisse"] },
  { key: "net_result", keywords: ["résultat net", "bénéfice", "profit", "rentabilité"] },
] as const;

function matchIntent(question: string): (typeof INTENTS)[number]["key"] | null {
  const q = question.toLowerCase();
  for (const intent of INTENTS) {
    if (intent.keywords.some((k) => q.includes(k))) return intent.key;
  }
  return null;
}

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:7b";

async function askOllama(question: string, context: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "Tu es l'assistant business intégré à une application de gestion de restaurant/bar/maquis au Burkina Faso. " +
              "Réponds en français, de façon brève et concrète (3-4 phrases max), en te basant UNIQUEMENT sur les données ci-dessous. " +
              "Si les données fournies ne permettent pas de répondre, dis-le clairement plutôt que d'inventer des chiffres. " +
              "Ne donne jamais de conseil médical, légal ou financier réglementé — reste sur des observations opérationnelles.\n\n" +
              `Données actuelles :\n${context}`,
          },
          { role: "user", content: question },
        ],
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "useAssistant");
    const { question } = z.object({ question: z.string().min(1) }).parse(await req.json());
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);

    if (venueIds.length === 0) {
      return NextResponse.json({ answer: "Aucun point de vente accessible pour répondre à cette question." });
    }

    const intent = matchIntent(question);

    if (!intent) {
      const [revRow] = await db
        .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
        .from(payments)
        .where(and(inArray(payments.venueId, venueIds), gte(payments.createdAt, startOfMonth())));
      const lowStockRows = await db
        .select({ name: products.name })
        .from(products)
        .where(and(inArray(products.venueId, venueIds), eq(products.active, true), sql`${products.stockQuantity} <= ${products.stockAlertThreshold}`))
        .limit(5);
      const [expRow] = await db
        .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.mapWith(Number) })
        .from(expenses)
        .where(and(inArray(expenses.venueId, venueIds), gte(expenses.expenseDate, startOfMonth().toISOString().slice(0, 10))));

      const context = [
        `Chiffre d'affaires du mois en cours : ${formatFcfa(revRow?.total ?? 0)}.`,
        `Dépenses du mois en cours : ${formatFcfa(expRow?.total ?? 0)}.`,
        lowStockRows.length > 0
          ? `Produits en stock bas : ${lowStockRows.map((r) => r.name).join(", ")}.`
          : "Aucun produit en stock bas.",
      ].join("\n");

      const llmAnswer = await askOllama(question, context);
      if (llmAnswer) {
        return NextResponse.json({ answer: llmAnswer, source: "llm" });
      }

      return NextResponse.json({
        answer:
          "Je peux répondre à des questions précises sur ton activité : chiffre d'affaires, produits les plus vendus, stock bas, dépenses, meilleurs clients, résultat net, ou l'état de la caisse. " +
          "Pour des questions plus libres, connecte un modèle Ollama local (variables OLLAMA_URL et OLLAMA_MODEL) — il n'a pas répondu cette fois-ci. Essaie l'une des suggestions ci-dessous en attendant.",
        source: "fallback",
      });
    }

    if (intent === "revenue_today") {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number), count: sql<number>`count(distinct ${payments.orderId})`.mapWith(Number) })
        .from(payments)
        .where(and(inArray(payments.venueId, venueIds), gte(payments.createdAt, startOfToday())));
      return NextResponse.json({
        answer: `Aujourd'hui, tu as encaissé ${formatFcfa(row?.total ?? 0)} sur ${row?.count ?? 0} commande(s).`,
      });
    }

    if (intent === "revenue_month") {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
        .from(payments)
        .where(and(inArray(payments.venueId, venueIds), gte(payments.createdAt, startOfMonth())));
      return NextResponse.json({ answer: `Ce mois-ci, ton chiffre d'affaires est de ${formatFcfa(row?.total ?? 0)}.` });
    }

    if (intent === "top_products") {
      const since30 = new Date();
      since30.setDate(since30.getDate() - 30);
      const rows = await db
        .select({
          name: products.name,
          revenue: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPrice}), 0)`.mapWith(Number),
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(inArray(orders.venueId, venueIds), eq(orders.status, "paid"), gte(orders.createdAt, since30)))
        .groupBy(products.id, products.name)
        .orderBy(desc(sql`sum(${orderItems.quantity} * ${orderItems.unitPrice})`))
        .limit(3);
      if (rows.length === 0) return NextResponse.json({ answer: "Pas encore assez de ventes ces 30 derniers jours pour établir un classement." });
      const list = rows.map((r, i) => `${i + 1}. ${r.name} (${formatFcfa(r.revenue)})`).join("\n");
      return NextResponse.json({ answer: `Tes produits les plus vendus sur les 30 derniers jours :\n${list}` });
    }

    if (intent === "low_stock") {
      const rows = await db
        .select({ name: products.name, stockQuantity: products.stockQuantity, unit: products.unit })
        .from(products)
        .where(and(inArray(products.venueId, venueIds), eq(products.active, true), sql`${products.stockQuantity} <= ${products.stockAlertThreshold}`))
        .limit(10);
      if (rows.length === 0) return NextResponse.json({ answer: "Aucun produit en stock bas actuellement — tout va bien !" });
      const list = rows.map((r) => `- ${r.name} (${r.stockQuantity} ${r.unit} restant)`).join("\n");
      return NextResponse.json({ answer: `Produits à réapprovisionner :\n${list}` });
    }

    if (intent === "expenses_month") {
      const rows = await db
        .select({ category: expenses.category, total: sql<number>`sum(${expenses.amount})`.mapWith(Number) })
        .from(expenses)
        .where(and(inArray(expenses.venueId, venueIds), gte(expenses.expenseDate, startOfMonth().toISOString().slice(0, 10))))
        .groupBy(expenses.category)
        .orderBy(desc(sql`sum(${expenses.amount})`));
      const total = rows.reduce((s, r) => s + r.total, 0);
      if (rows.length === 0) return NextResponse.json({ answer: "Aucune dépense enregistrée ce mois-ci." });
      const list = rows.slice(0, 5).map((r) => `- ${r.category} : ${formatFcfa(r.total)}`).join("\n");
      return NextResponse.json({ answer: `Dépenses du mois : ${formatFcfa(total)} au total.\n${list}` });
    }

    if (intent === "top_customers") {
      const rows = await db
        .select({ name: customers.name, totalSpent: customers.totalSpent, loyaltyPoints: customers.loyaltyPoints })
        .from(customers)
        .where(inArray(customers.venueId, venueIds))
        .orderBy(desc(customers.totalSpent))
        .limit(5);
      if (rows.length === 0) return NextResponse.json({ answer: "Aucun client enregistré pour le moment." });
      const list = rows.map((r, i) => `${i + 1}. ${r.name} — ${formatFcfa(r.totalSpent)} (${r.loyaltyPoints} pts)`).join("\n");
      return NextResponse.json({ answer: `Tes meilleurs clients :\n${list}` });
    }

    if (intent === "cash_status") {
      const rows = await db
        .select()
        .from(cashSessions)
        .where(and(inArray(cashSessions.venueId, venueIds), eq(cashSessions.status, "open")));
      if (rows.length === 0) return NextResponse.json({ answer: "Aucune session de caisse n'est actuellement ouverte." });
      const list = rows.map((r) => `- Session #${r.id} : fond de départ ${formatFcfa(r.openingAmount)}`).join("\n");
      return NextResponse.json({ answer: `Session(s) de caisse ouverte(s) :\n${list}` });
    }

    if (intent === "net_result") {
      const [rev] = await db
        .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
        .from(payments)
        .where(and(inArray(payments.venueId, venueIds), gte(payments.createdAt, startOfMonth())));
      const [profitRow] = await db
        .select({ profit: sql<number>`coalesce(sum((${orderItems.unitPrice} - ${products.costPrice}) * ${orderItems.quantity}), 0)`.mapWith(Number) })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(inArray(orders.venueId, venueIds), eq(orders.status, "paid"), gte(orders.createdAt, startOfMonth())));
      const [expRow] = await db
        .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.mapWith(Number) })
        .from(expenses)
        .where(and(inArray(expenses.venueId, venueIds), gte(expenses.expenseDate, startOfMonth().toISOString().slice(0, 10))));

      const grossProfit = profitRow?.profit ?? 0;
      const totalExpenses = expRow?.total ?? 0;
      const net = grossProfit - totalExpenses;
      return NextResponse.json({
        answer: `Ce mois-ci : CA ${formatFcfa(rev?.total ?? 0)}, marge brute ${formatFcfa(grossProfit)}, dépenses ${formatFcfa(totalExpenses)} → résultat net ${net >= 0 ? "positif" : "négatif"} de ${formatFcfa(Math.abs(net))}.`,
      });
    }

    return NextResponse.json({ answer: "Je n'ai pas de réponse pour cette question pour le moment." });
  } catch (error) {
    return handleApiError(error);
  }
}
