import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { venueShiftSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { getShiftSettings } from "@/lib/shift-settings";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    if (!venueId) return NextResponse.json({ error: "venueId requis" }, { status: 400 });

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    return NextResponse.json({ settings: await getShiftSettings(venueId) });
  } catch (error) {
    return handleApiError(error);
  }
}

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const updateSchema = z.object({
  venueId: z.number(),
  dayStartTime: z.string().regex(timeRegex, "Heure invalide (HH:MM)"),
  dayEndTime: z.string().regex(timeRegex, "Heure invalide (HH:MM)"),
  nightStartTime: z.string().regex(timeRegex, "Heure invalide (HH:MM)"),
  nightEndTime: z.string().regex(timeRegex, "Heure invalide (HH:MM)"),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageServers");
    const body = updateSchema.parse(await req.json());

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    const [existing] = await db
      .select({ id: venueShiftSettings.id })
      .from(venueShiftSettings)
      .where(eq(venueShiftSettings.venueId, body.venueId))
      .limit(1);

    const values = {
      dayStartTime: body.dayStartTime,
      dayEndTime: body.dayEndTime,
      nightStartTime: body.nightStartTime,
      nightEndTime: body.nightEndTime,
      updatedAt: new Date(),
    };

    const [settings] = existing
      ? await db
          .update(venueShiftSettings)
          .set(values)
          .where(eq(venueShiftSettings.id, existing.id))
          .returning()
      : await db
          .insert(venueShiftSettings)
          .values({ venueId: body.venueId, ...values })
          .returning();

    await logAudit({
      userId: session.userId,
      venueId: body.venueId,
      action: "update",
      entity: "venue_shift_settings",
      entityId: settings.id,
      details: values,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}
