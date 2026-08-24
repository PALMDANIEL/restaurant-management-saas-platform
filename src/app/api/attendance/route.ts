import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attendanceRecords, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { requireSession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { can } from "@/lib/rbac";
import { getShiftSettings } from "@/lib/shift-settings";
import { getBusinessDate } from "@/lib/business-day";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    const workDate = req.nextUrl.searchParams.get("workDate");
    if (!venueId || !workDate) {
      return NextResponse.json({ error: "venueId et workDate requis" }, { status: 400 });
    }

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(venueId)) return NextResponse.json({ records: [] });

    const rows = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.venueId, venueId), eq(attendanceRecords.workDate, workDate)));

    return NextResponse.json({ records: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const clockInSchema = z.object({
  venueId: z.number(),
  userId: z.number().optional(), // par défaut, on pointe pour soi-même
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.role, "manageOrders")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const body = clockInSchema.parse(await req.json());
    const targetUserId = body.userId ?? session.userId;

    if (targetUserId !== session.userId && !can(session.role, "manageServers")) {
      return NextResponse.json(
        { error: "Vous ne pouvez pointer que votre propre arrivée." },
        { status: 403 }
      );
    }

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!target) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    if (!target.shiftGroup) {
      return NextResponse.json(
        { error: "Cette personne n'a pas d'équipe (jour/soir) assignée. Modifiez sa fiche d'abord." },
        { status: 400 }
      );
    }

    // Empêche un double pointage en cours (arrivée sans départ enregistré) pour la même personne.
    const [open] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, targetUserId), isNull(attendanceRecords.clockOut)))
      .limit(1);
    if (open) {
      return NextResponse.json({ error: "Un pointage d'arrivée est déjà en cours pour cette personne." }, { status: 400 });
    }

    const settings = await getShiftSettings(body.venueId);
    const now = new Date();
    const workDate = getBusinessDate(now, settings.nightEndTime);

    const [record] = await db
      .insert(attendanceRecords)
      .values({
        venueId: body.venueId,
        userId: targetUserId,
        shiftGroup: target.shiftGroup,
        workDate,
        clockIn: now,
        createdBy: session.userId,
      })
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: body.venueId,
      action: "clock_in",
      entity: "attendance_record",
      entityId: record.id,
      details: { targetUserId, workDate },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const clockOutSchema = z.object({ id: z.number() });

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.role, "manageOrders")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const body = clockOutSchema.parse(await req.json());

    const [existing] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, body.id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Pointage introuvable" }, { status: 404 });

    if (existing.userId !== session.userId && !can(session.role, "manageServers")) {
      return NextResponse.json({ error: "Vous ne pouvez pointer que votre propre départ." }, { status: 403 });
    }
    if (existing.clockOut) {
      return NextResponse.json({ error: "Ce pointage est déjà clôturé." }, { status: 400 });
    }

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(existing.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    const [record] = await db
      .update(attendanceRecords)
      .set({ clockOut: new Date() })
      .where(eq(attendanceRecords.id, body.id))
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: existing.venueId,
      action: "clock_out",
      entity: "attendance_record",
      entityId: record.id,
    });

    return NextResponse.json({ record });
  } catch (error) {
    return handleApiError(error);
  }
}
