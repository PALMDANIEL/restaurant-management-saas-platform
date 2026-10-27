import { NextRequest, NextResponse } from "next/server";
import { requireSession, getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";
import { getShiftSettings } from "@/lib/shift-settings";
import { getBusinessDate } from "@/lib/business-day";
import { computeStaffDays, rulesFor } from "@/lib/staff-scoring";

/** Détail du jour de chaque serveuse : ventes, pointage, ponctualité, comportement, note sur 20. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    if (!venueId) return NextResponse.json({ error: "venueId requis" }, { status: 400 });

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    const settings = await getShiftSettings(venueId);
    const today = getBusinessDate(new Date(), settings.nightEndTime);
    const workDate = req.nextUrl.searchParams.get("workDate") || today;
    const { servers, days, versions } = await computeStaffDays({ venueId, from: workDate, to: workDate });

    const staff = days
      .map((d) => {
        const s = servers.find((x) => x.id === d.userId)!;
        return { id: s.id, firstName: s.firstName, lastName: s.lastName, ...d };
      })
      .sort((a, b) => (b.note ?? -1) - (a.note ?? -1) || b.totalSales - a.totalSales);

    return NextResponse.json({ workDate, today, settings, rules: rulesFor(versions, workDate), staff });
  } catch (error) {
    return handleApiError(error);
  }
}
