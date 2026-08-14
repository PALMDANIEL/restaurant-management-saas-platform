import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reservations, restaurantTables } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { requireSession, getRequestVenueIds, handleApiError, logAudit, pushNotification } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getRequestVenueIds(session, req.nextUrl.searchParams);
    if (venueIds.length === 0) return NextResponse.json({ reservations: [] });

    const rows = await db
      .select()
      .from(reservations)
      .where(inArray(reservations.venueId, venueIds))
      .orderBy(desc(reservations.reservationTime));

    const tableIds = [...new Set(rows.map((r) => r.tableId).filter(Boolean))] as number[];
    const tables = tableIds.length
      ? await db.select().from(restaurantTables).where(inArray(restaurantTables.id, tableIds))
      : [];

    const enriched = rows.map((r) => ({
      ...r,
      tableNumber: tables.find((t) => t.id === r.tableId)?.number ?? null,
    }));

    return NextResponse.json({ reservations: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  venueId: z.number(),
  tableId: z.number().nullable().optional(),
  customerName: z.string().min(1),
  phone: z.string().optional(),
  partySize: z.number().min(1).default(2),
  reservationTime: z.string().min(1),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageReservations");
    const body = createSchema.parse(await req.json());
    const [reservation] = await db
      .insert(reservations)
      .values({
        venueId: body.venueId,
        tableId: body.tableId ?? null,
        customerName: body.customerName,
        phone: body.phone,
        partySize: body.partySize,
        reservationTime: new Date(body.reservationTime),
        notes: body.notes,
      })
      .returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "reservation", entityId: reservation.id, details: body });
    await pushNotification({
      venueId: body.venueId,
      type: "system",
      title: "Nouvelle réservation",
      message: `${body.customerName} — ${body.partySize} pers. le ${new Date(body.reservationTime).toLocaleString("fr-FR")}.`,
    });
    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  status: z.enum(["pending", "confirmed", "seated", "cancelled", "completed"]).optional(),
  tableId: z.number().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageReservations");
    const body = updateSchema.parse(await req.json());
    const { id, ...rest } = body;
    const [updated] = await db.update(reservations).set(rest).where(eq(reservations.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 });
    await logAudit({ userId: session.userId, venueId: updated.venueId, action: "update", entity: "reservation", entityId: id, details: rest });
    return NextResponse.json({ reservation: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
