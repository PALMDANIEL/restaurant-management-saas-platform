import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetings, shiftGroups } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireCompanySession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

const fields = {
  title: z.string().trim().min(1, "Titre requis").max(150),
  notes: z.string().trim().max(2000).nullable().optional(),
  place: z.string().trim().max(150).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  remind2h: z.boolean().optional(),
  remind1h: z.boolean().optional(),
  groupIds: z.array(z.number()).nullable().optional(),
};

async function checkGroups(groupIds: number[] | null | undefined, venueId: number) {
  if (!groupIds || groupIds.length === 0) return null;
  const found = await db.select({ id: shiftGroups.id }).from(shiftGroups).where(and(eq(shiftGroups.venueId, venueId), inArray(shiftGroups.id, groupIds)));
  return found.length === new Set(groupIds).size ? [...new Set(groupIds)] : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const body = z.object({ venueId: z.number(), ...fields }).parse(await req.json());
    if (!(await getAccessibleVenueIds(session)).includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }
    const groupIds = await checkGroups(body.groupIds, body.venueId);
    if (groupIds === undefined) return NextResponse.json({ error: "Groupe inconnu pour ce point de vente." }, { status: 400 });
    const [meeting] = await db
      .insert(meetings)
      .values({
        venueId: body.venueId, title: body.title, notes: body.notes || null, place: body.place || null,
        startsAt: new Date(body.startsAt), remind2h: body.remind2h ?? true, remind1h: body.remind1h ?? true,
        groupIds, createdBy: session.userId,
      })
      .returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "meeting", entityId: meeting.id, details: { title: body.title, startsAt: body.startsAt } });
    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const body = z.object({ id: z.number(), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])) } as Record<string, z.ZodTypeAny>).parse(await req.json()) as {
      id: number; title?: string; notes?: string | null; place?: string | null; startsAt?: string; remind2h?: boolean; remind1h?: boolean; groupIds?: number[] | null;
    };
    const [existing] = await db.select().from(meetings).where(eq(meetings.id, body.id)).limit(1);
    if (!existing || !(await getAccessibleVenueIds(session)).includes(existing.venueId)) {
      return NextResponse.json({ error: "Réunion introuvable" }, { status: 404 });
    }
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.notes !== undefined) updates.notes = body.notes || null;
    if (body.place !== undefined) updates.place = body.place || null;
    if (body.startsAt !== undefined) updates.startsAt = new Date(body.startsAt);
    if (body.remind2h !== undefined) updates.remind2h = body.remind2h;
    if (body.remind1h !== undefined) updates.remind1h = body.remind1h;
    if (body.groupIds !== undefined) {
      const groupIds = await checkGroups(body.groupIds, existing.venueId);
      if (groupIds === undefined) return NextResponse.json({ error: "Groupe inconnu pour ce point de vente." }, { status: 400 });
      updates.groupIds = groupIds;
    }
    const [meeting] = await db.update(meetings).set(updates).where(eq(meetings.id, body.id)).returning();
    await logAudit({ userId: session.userId, venueId: existing.venueId, action: "update", entity: "meeting", entityId: body.id, details: updates });
    return NextResponse.json({ meeting });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const id = Number(req.nextUrl.searchParams.get("id"));
    const [existing] = id ? await db.select().from(meetings).where(eq(meetings.id, id)).limit(1) : [];
    if (!existing || !(await getAccessibleVenueIds(session)).includes(existing.venueId)) {
      return NextResponse.json({ error: "Réunion introuvable" }, { status: 404 });
    }
    await db.delete(meetings).where(eq(meetings.id, id));
    await logAudit({ userId: session.userId, venueId: existing.venueId, action: "delete", entity: "meeting", entityId: id, details: { title: existing.title } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
