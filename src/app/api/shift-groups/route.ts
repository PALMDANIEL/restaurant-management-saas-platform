import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { shiftGroups, shiftPlanBlocks, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireCompanySession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

async function ownedGroup(id: number, companyVenueIds: number[]) {
  const [g] = await db.select().from(shiftGroups).where(eq(shiftGroups.id, id)).limit(1);
  return g && companyVenueIds.includes(g.venueId) ? g : null;
}

const createSchema = z.object({ venueId: z.number(), name: z.string().trim().min(1, "Nom requis").max(40) });

export async function POST(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const body = createSchema.parse(await req.json());
    if (!(await getAccessibleVenueIds(session)).includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }
    const existing = await db.select({ name: shiftGroups.name }).from(shiftGroups).where(eq(shiftGroups.venueId, body.venueId));
    if (existing.some((g) => g.name.toLowerCase() === body.name.toLowerCase())) {
      return NextResponse.json({ error: "Un groupe porte déjà ce nom." }, { status: 400 });
    }
    const [group] = await db.insert(shiftGroups).values({ venueId: body.venueId, name: body.name }).returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "shift_group", entityId: group.id, details: { name: body.name } });
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const renameSchema = z.object({ id: z.number(), name: z.string().trim().min(1, "Nom requis").max(40) });

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const body = renameSchema.parse(await req.json());
    const group = await ownedGroup(body.id, await getAccessibleVenueIds(session));
    if (!group) return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    const [updated] = await db.update(shiftGroups).set({ name: body.name }).where(eq(shiftGroups.id, body.id)).returning();
    await logAudit({ userId: session.userId, venueId: group.venueId, action: "update", entity: "shift_group", entityId: group.id, details: { name: body.name } });
    return NextResponse.json({ group: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const id = Number(req.nextUrl.searchParams.get("id"));
    const group = id ? await ownedGroup(id, await getAccessibleVenueIds(session)) : null;
    if (!group) return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    // Les membres retournent à leur équipe fixe ; les blocs du groupe disparaissent avec lui.
    await db.update(users).set({ rotationGroupId: null }).where(and(eq(users.rotationGroupId, id), eq(users.companyId, session.companyId)));
    await db.delete(shiftPlanBlocks).where(eq(shiftPlanBlocks.groupId, id));
    await db.delete(shiftGroups).where(eq(shiftGroups.id, id));
    await logAudit({ userId: session.userId, venueId: group.venueId, action: "delete", entity: "shift_group", entityId: id, details: { name: group.name } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
