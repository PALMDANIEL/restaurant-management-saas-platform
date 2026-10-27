import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  orders,
  orderItems,
  products,
  users,
  venues,
  companies,
  restaurantTables,
  customers,
  payments,
  creditNotes,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireSession, getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";
import { withoutSecrets } from "@/lib/ligdicash";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const session = await requireSession();
    const { orderId: orderIdParam } = await params;
    const orderId = Number(orderIdParam);
    if (!orderId) return NextResponse.json({ error: "Commande invalide" }, { status: 400 });

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(order.venueId)) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    const [venue] = await db.select().from(venues).where(eq(venues.id, order.venueId)).limit(1);
    const [company] = venue
      ? await db.select().from(companies).where(eq(companies.id, venue.companyId)).limit(1)
      : [null];

    const items = await db
      .select({
        id: orderItems.id,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        observations: orderItems.observations,
        productName: products.name,
        unit: products.unit,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, order.id));

    const paymentRows = await db.select().from(payments).where(eq(payments.orderId, order.id));

    const noteIds = [
      ...new Set(
        paymentRows.flatMap((p) => [p.creditNoteIssuedId, p.creditNoteRedeemedId]).filter(Boolean)
      ),
    ] as number[];
    const noteRows = noteIds.length
      ? await db.select().from(creditNotes).where(inArray(creditNotes.id, noteIds))
      : [];

    const enrichedPayments = paymentRows.map((p) => ({
      ...p,
      creditNoteIssued: noteRows.find((n) => n.id === p.creditNoteIssuedId) ?? null,
      creditNoteRedeemed: noteRows.find((n) => n.id === p.creditNoteRedeemedId) ?? null,
    }));

    const [server] = order.serverId
      ? await db.select().from(users).where(eq(users.id, order.serverId)).limit(1)
      : [null];
    const [cashier] = order.cashierId
      ? await db.select().from(users).where(eq(users.id, order.cashierId)).limit(1)
      : [null];
    const [table] = order.tableId
      ? await db.select().from(restaurantTables).where(eq(restaurantTables.id, order.tableId)).limit(1)
      : [null];
    const [customer] = order.customerId
      ? await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1)
      : [null];

    // Qui a reçu l'argent : le dernier des `receivedBy` renseignés sur les paiements de la
    // commande, sinon le caissier de la commande.
    const receiverId = [...paymentRows].reverse().find((p) => p.receivedBy)?.receivedBy ?? order.cashierId;
    const [receiver] = receiverId
      ? await db.select().from(users).where(eq(users.id, receiverId)).limit(1)
      : [null];

    return NextResponse.json({
      order,
      items,
      venue,
      company: company ? withoutSecrets(company) : null,
      payments: enrichedPayments,
      server: server ? { firstName: server.firstName, lastName: server.lastName } : null,
      cashier: receiver ? { firstName: receiver.firstName, lastName: receiver.lastName } : cashier
        ? { firstName: cashier.firstName, lastName: cashier.lastName }
        : null,
      table: table ? { number: table.number } : null,
      customer: customer ? { name: customer.name, phone: customer.phone } : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
