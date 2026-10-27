import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staffBehaviorRatings, userVenues, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";

const criterion = z.number().int().min(1).max(5);
const ratingSchema = z.object({
  venueId: z.number(),
  userId: z.number(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  courtesy: criterion,
  appearance: criterion,
  teamwork: criterion,
  rigor: criterion,
  responsiveness: criterion,
  comment: z.string().trim().max(1000).optional(),
});

/** Enregistre (ou remplace) la fiche de comportement d'une serveuse pour une journée. */
export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageServers");
    const body = ratingSchema.parse(await req.json());
    if (body.userId === session.userId) {
      return NextResponse.json({ error: "Vous ne pouvez pas noter votre propre comportement." }, { status: 403 });
    }
    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }
    const [member] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userVenues, eq(userVenues.userId, users.id))
      .where(and(eq(users.id, body.userId), eq(userVenues.venueId, body.venueId), eq(users.role, "serveuse")))
      .limit(1);
    if (!member) return NextResponse.json({ error: "Serveuse introuvable dans ce point de vente" }, { status: 404 });

    const { venueId, userId, workDate, comment, ...scores } = body;
    const values = { ...scores, comment: comment || null, ratedBy: session.userId, updatedAt: new Date() };
    const [rating] = await db
      .insert(staffBehaviorRatings)
      .values({ venueId, userId, workDate, ...values })
      .onConflictDoUpdate({
        target: [staffBehaviorRatings.venueId, staffBehaviorRatings.userId, staffBehaviorRatings.workDate],
        set: values,
      })
      .returning();

    await logAudit({
      userId: session.userId,
      venueId,
      action: "rate",
      entity: "staff_behavior",
      entityId: rating.id,
      details: { userId, workDate, ...scores },
    });
    return NextResponse.json({ rating });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertCan(session.role, "manageServers");
    const id = Number(req.nextUrl.searchParams.get("id"));
    const [existing] = id
      ? await db.select().from(staffBehaviorRatings).where(eq(staffBehaviorRatings.id, id)).limit(1)
      : [];
    if (!existing) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(existing.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }
    await db.delete(staffBehaviorRatings).where(eq(staffBehaviorRatings.id, id));
    await logAudit({ userId: session.userId, venueId: existing.venueId, action: "delete", entity: "staff_behavior", entityId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
