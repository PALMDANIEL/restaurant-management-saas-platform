import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staffScoringRules } from "@/db/schema";
import { z } from "zod";
import { requireSession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan, can } from "@/lib/rbac";
import { getShiftSettings } from "@/lib/shift-settings";
import { getBusinessDate } from "@/lib/business-day";
import { DEFAULT_SCORING_RULES, getRuleVersions, rulesFor, scoringRulesSchema } from "@/lib/staff-scoring";

async function checkVenue(venueId: number) {
  const session = await requireSession();
  const accessible = await getAccessibleVenueIds(session);
  if (!venueId || !accessible.includes(venueId)) return { session, ok: false as const };
  return { session, ok: true as const };
}

/** Règles en vigueur aujourd'hui, et dates des changements précédents. */
export async function GET(req: NextRequest) {
  try {
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    const { session, ok } = await checkVenue(venueId);
    if (!ok) return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    if (!can(session.role, "manageServers")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const settings = await getShiftSettings(venueId);
    const today = getBusinessDate(new Date(), settings.nightEndTime);
    const versions = await getRuleVersions(venueId);
    return NextResponse.json({
      today,
      rules: rulesFor(versions, today),
      defaults: DEFAULT_SCORING_RULES,
      canEdit: can(session.role, "manageVenues"),
      changes: versions.map((v) => ({ effectiveFrom: v.effectiveFrom, updatedAt: v.updatedAt })).reverse(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const putSchema = z.object({ venueId: z.number(), rules: scoringRulesSchema });

/** Enregistre de nouvelles règles, appliquées à partir de la journée en cours. */
export async function PUT(req: NextRequest) {
  try {
    const raw = await req.json();
    const { session, ok } = await checkVenue(Number(raw?.venueId));
    if (!ok) return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    assertCan(session.role, "manageVenues");
    const body = putSchema.parse(raw);

    const settings = await getShiftSettings(body.venueId);
    const effectiveFrom = getBusinessDate(new Date(), settings.nightEndTime);
    const values = { rules: body.rules, updatedBy: session.userId, updatedAt: new Date() };
    await db
      .insert(staffScoringRules)
      .values({ venueId: body.venueId, effectiveFrom, ...values })
      .onConflictDoUpdate({ target: [staffScoringRules.venueId, staffScoringRules.effectiveFrom], set: values });

    await logAudit({
      userId: session.userId,
      venueId: body.venueId,
      action: "update",
      entity: "staff_scoring_rules",
      details: { effectiveFrom, rules: body.rules },
    });
    return NextResponse.json({ effectiveFrom, rules: body.rules });
  } catch (error) {
    return handleApiError(error);
  }
}
