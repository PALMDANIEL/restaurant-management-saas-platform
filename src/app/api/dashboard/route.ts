import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  payments,
  orders,
  orderItems,
  products,
  users,
  customers,
} from "@/db/schema";
import { and, eq, gte, inArray, sql, desc } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError } from "@/lib/api-helpers";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeek() {
  const d = startOfToday();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}
function startOfMonth() {
  const d = startOfToday();
  d.setDate(1);
  return d;
}
function startOfYear() {
  const d = startOfToday();
  d.setMonth(0, 1);
  return d;
}

async function periodStats(venueIds: number[], since: Date) {
  if (venueIds.length === 0) return { revenue: 0, ordersCount: 0, profit: 0 };

  const [rev] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${payments.amount}), 0)`,
      ordersCount: sql<number>`count(distinct ${payments.orderId})`,
    })
    .from(payments)
    .where(and(inArray(payments.venueId, venueIds), gte(payments.createdAt, since)));

  const [profitRow] = await db
    .select({
      profit: sql<number>`coalesce(sum((${orderItems.unitPrice} - ${products.costPrice}) * ${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        inArray(orders.venueId, venueIds),
        eq(orders.status, "paid"),
        gte(orders.createdAt, since)
      )
    );

  return {
    revenue: Number(rev?.revenue ?? 0),
    ordersCount: Number(rev?.ordersCount ?? 0),
    profit: Number(profitRow?.profit ?? 0),
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);

    const [today, week, month, year] = await Promise.all([
      periodStats(venueIds, startOfToday()),
      periodStats(venueIds, startOfWeek()),
      periodStats(venueIds, startOfMonth()),
      periodStats(venueIds, startOfYear()),
    ]);

    let topProducts: { name: string; quantity: number; revenue: number }[] = [];
    let topServers: { id: number; name: string; sales: number; revenue: number }[] = [];
    let lowStock: { id: number; name: string; stockQuantity: string; stockAlertThreshold: string }[] = [];
    let outOfStock: { id: number; name: string }[] = [];
    let evolution: { date: string; revenue: number }[] = [];
    let statusCounts: { status: string; count: number }[] = [];
    let topCustomers: { id: number; name: string; totalSpent: number }[] = [];

    if (venueIds.length > 0) {
      const since30 = new Date();
      since30.setDate(since30.getDate() - 30);

      topProducts = await db
        .select({
          name: products.name,
          quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
          revenue: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPrice}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(
          and(
            inArray(orders.venueId, venueIds),
            eq(orders.status, "paid"),
            gte(orders.createdAt, since30)
          )
        )
        .groupBy(products.id, products.name)
        .orderBy(desc(sql`sum(${orderItems.quantity} * ${orderItems.unitPrice})`))
        .limit(6);

      topServers = await db
        .select({
          id: users.id,
          name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
          sales: sql<number>`count(distinct ${orders.id})`,
          revenue: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .innerJoin(users, eq(orders.serverId, users.id))
        .where(
          and(
            inArray(orders.venueId, venueIds),
            eq(orders.status, "paid"),
            gte(orders.createdAt, startOfMonth())
          )
        )
        .groupBy(users.id, users.firstName, users.lastName)
        .orderBy(desc(sql`sum(${orders.totalAmount})`))
        .limit(6);

      lowStock = await db
        .select({
          id: products.id,
          name: products.name,
          stockQuantity: products.stockQuantity,
          stockAlertThreshold: products.stockAlertThreshold,
        })
        .from(products)
        .where(
          and(
            inArray(products.venueId, venueIds),
            eq(products.active, true),
            sql`${products.stockQuantity} <= ${products.stockAlertThreshold}`
          )
        )
        .orderBy(sql`${products.stockQuantity} asc`)
        .limit(10);

      outOfStock = lowStock
        .filter((p) => Number(p.stockQuantity) <= 0)
        .map((p) => ({ id: p.id, name: p.name }));

      const evoRows = await db
        .select({
          date: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM-DD')`,
          revenue: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        })
        .from(payments)
        .where(and(inArray(payments.venueId, venueIds), gte(payments.createdAt, since30)))
        .groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${payments.createdAt}, 'YYYY-MM-DD')`);
      evolution = evoRows.map((r) => ({ date: r.date, revenue: Number(r.revenue) }));

      const statusRows = await db
        .select({ status: orders.status, count: sql<number>`count(*)` })
        .from(orders)
        .where(and(inArray(orders.venueId, venueIds), gte(orders.createdAt, since30)))
        .groupBy(orders.status);
      statusCounts = statusRows.map((r) => ({ status: r.status, count: Number(r.count) }));

      topCustomers = await db
        .select({ id: customers.id, name: customers.name, totalSpent: customers.totalSpent })
        .from(customers)
        .where(inArray(customers.venueId, venueIds))
        .orderBy(desc(customers.totalSpent))
        .limit(5);
    }

    return NextResponse.json({
      today,
      week,
      month,
      year,
      topProducts,
      topServers,
      lowStock,
      outOfStock,
      evolution,
      statusCounts,
      topCustomers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
