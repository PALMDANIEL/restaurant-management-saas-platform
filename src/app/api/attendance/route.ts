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
  // Saisie après coup par un responsable (oubli de pointage) : heures réelles et motif.
  clockIn: z.string().datetime({ offset: true }).optional(),
  clockOut: z.string().datetime({ offset: true }).optional(),
  correctionNote: z.string().trim().min(1).max(300).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!can(session.role, "manageOrders")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const body = clockInSchema.parse(await req.json());
    const targetUserId = body.userId ?? session.userId;
    const manual = !!body.clockIn;
    if (manual && (!can(session.role, "manageServers") || targetUserId === session.userId)) {
      return NextResponse.json(
        { error: "Seul un responsable peut saisir après coup le pointage d'une autre personne." },
        { status: 403 }
      );
    }
    if (manual && !body.correctionNote) {
      return NextResponse.json({ error: "Indiquez le motif de la saisie manuelle." }, { status: 400 });
    }

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

    const now = new Date();
    const clockInAt = body.clockIn ? new Date(body.clockIn) : now;
    const clockOutAt = body.clockOut ? new Date(body.clockOut) : null;
    if (clockInAt > now || (clockOutAt && (clockOutAt <= clockInAt || clockOutAt > now))) {
      return NextResponse.json({ error: "Heures incohérentes (départ avant l'arrivée ou dans le futur)." }, { status: 400 });
    }

    // Empêche un double pointage en cours (arrivée sans départ enregistré) pour la même personne.
    const [open] = await db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, targetUserId), isNull(attendanceRecords.clockOut)))
      .limit(1);
    if (open && !clockOutAt) {
      return NextResponse.json({ error: "Un pointage d'arrivée est déjà en cours pour cette personne." }, { status: 400 });
    }

    const settings = await getShiftSettings(body.venueId);
    const workDate = getBusinessDate(clockInAt, settings.nightEndTime);

    const [record] = await db
      .insert(attendanceRecords)
      .values({
        venueId: body.venueId,
        userId: targetUserId,
        shiftGroup: target.shiftGroup,
        workDate,
        clockIn: clockInAt,
        clockOut: clockOutAt,
        correctedBy: manual ? session.userId : null,
        correctionNote: manual ? body.correctionNote : null,
        createdBy: session.userId,
      })
      .returning();

    await logAudit({
      userId: session.userId,
      venueId: body.venueId,
      action: "clock_in",
      entity: "attendance_record",
      entityId: record.id,
      details: { targetUserId, workDate, manual, correctionNote: body.correctionNote },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const clockOutSchema = z.object({
  id: z.number(),
  // Correction par un responsable : nouvelles heures et motif obligatoire.
  clockIn: z.string().datetime({ offset: true }).optional(),
  clockOut: z.string().datetime({ offset: true }).nullable().optional(),
  correctionNote: z.string().trim().min(1).max(300).optional(),
});

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
    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(existing.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    if (body.clockIn !== undefined || body.clockOut !== undefined) {
      if (!can(session.role, "manageServers") || existing.userId === session.userId) {
        return NextResponse.json({ error: "Seul un responsable peut corriger les heures d'une autre personne." }, { status: 403 });
      }
      if (!body.correctionNote) {
        return NextResponse.json({ error: "Indiquez le motif de la correction." }, { status: 400 });
      }
      const clockIn = body.clockIn ? new Date(body.clockIn) : existing.clockIn;
      const clockOut = body.clockOut === undefined ? existing.clockOut : body.clockOut ? new Date(body.clockOut) : null;
      const now = new Date();
      if (clockIn > now || (clockOut && (clockOut <= clockIn || clockOut > now))) {
        return NextResponse.json({ error: "Heures incohérentes (départ avant l'arrivée ou dans le futur)." }, { status: 400 });
      }
      const settings = await getShiftSettings(existing.venueId);
      const [record] = await db
        .update(attendanceRecords)
        .set({
          clockIn,
          clockOut,
          workDate: getBusinessDate(clockIn, settings.nightEndTime),
          correctedBy: session.userId,
          correctionNote: body.correctionNote,
        })
        .where(eq(attendanceRecords.id, body.id))
        .returning();
      await logAudit({
        userId: session.userId,
        venueId: existing.venueId,
        action: "correct",
        entity: "attendance_record",
        entityId: record.id,
        details: {
          before: { clockIn: existing.clockIn, clockOut: existing.clockOut },
          after: { clockIn, clockOut },
          note: body.correctionNote,
        },
      });
      return NextResponse.json({ record });
    }

    if (existing.clockOut) {
      return NextResponse.json({ error: "Ce pointage est déjà clôturé." }, { status: 400 });
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
