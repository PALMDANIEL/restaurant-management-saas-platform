import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, userVenues } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireCompanySession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { addDays, dateKeysBetween, generateBlocks, groupBelongsToVenue, loadPlan, replaceRange, resolveShift } from "@/lib/shift-plan";
import { z } from "zod";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Groupes, blocs de planning et service jour par jour de chaque serveuse sur la période demandée. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    const venueId = Number(req.nextUrl.searchParams.get("venueId"));
    const from = req.nextUrl.searchParams.get("from") ?? "";
    const to = req.nextUrl.searchParams.get("to") ?? "";
    if (!venueId || !dateRe.test(from) || !dateRe.test(to) || to < from) {
      return NextResponse.json({ error: "venueId, from et to (AAAA-MM-JJ) requis" }, { status: 400 });
    }
    if (dateKeysBetween(from, to).length > 62) return NextResponse.json({ error: "Période trop longue (62 jours au plus)." }, { status: 400 });
    if (!(await getAccessibleVenueIds(session)).includes(venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }

    const { groups, blocks } = await loadPlan(venueId, from, to);
    const assigned = await db.select({ userId: userVenues.userId }).from(userVenues).where(eq(userVenues.venueId, venueId));
    const ids = assigned.map((a) => a.userId);
    const members = ids.length
      ? await db
          .select({
            id: users.id, firstName: users.firstName, lastName: users.lastName,
            shiftGroup: users.shiftGroup, restDay: users.restDay, rotationGroupId: users.rotationGroupId,
          })
          .from(users)
          .where(and(inArray(users.id, ids), eq(users.role, "serveuse"), eq(users.active, true), eq(users.companyId, session.companyId)))
      : [];
    const days = dateKeysBetween(from, to);
    const schedule = members.map((m) => ({
      userId: m.id,
      days: days.map((d) => resolveShift(m, d, blocks).status),
    }));
    return NextResponse.json({ groups, blocks, members, days, schedule });
  } catch (error) {
    return handleApiError(error);
  }
}

const blockSchema = z.object({
  groupId: z.number(),
  shift: z.enum(["jour", "soir"]),
  startDate: z.string().regex(dateRe),
  endDate: z.string().regex(dateRe),
});

const putSchema = z.object({
  venueId: z.number(),
  from: z.string().regex(dateRe),
  to: z.string().regex(dateRe),
  blocks: z.array(blockSchema).max(400),
});

/** Remplace le planning entre `from` et `to` par les blocs fournis (saisie manuelle du manager). */
export async function PUT(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const body = putSchema.parse(await req.json());
    if (body.to < body.from) return NextResponse.json({ error: "Dates incohérentes." }, { status: 400 });
    if (!(await getAccessibleVenueIds(session)).includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }
    for (const b of body.blocks) {
      if (b.endDate < b.startDate || b.startDate < body.from || b.endDate > body.to) {
        return NextResponse.json({ error: "Un bloc sort de la période." }, { status: 400 });
      }
      if (!(await groupBelongsToVenue(b.groupId, body.venueId))) {
        return NextResponse.json({ error: "Groupe inconnu pour ce point de vente." }, { status: 400 });
      }
    }
    await replaceRange(body.venueId, body.from, body.to, body.blocks);
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "update", entity: "shift_plan", details: { from: body.from, to: body.to, blocks: body.blocks.length } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

const generateSchema = z.object({
  venueId: z.number(),
  startDate: z.string().regex(dateRe),
  endDate: z.string().regex(dateRe),
  daysPerBlock: z.number().int().min(1).max(31),
  mode: z.enum(["matin-tourne", "un-par-service"]),
  groupIds: z.array(z.number()).min(1, "Choisissez au moins un groupe").max(12),
});

/** Prérempli le planning d'une période à partir d'une rotation (le manager peut ensuite le corriger). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const body = generateSchema.parse(await req.json());
    if (body.endDate < body.startDate) return NextResponse.json({ error: "La date de fin précède le début." }, { status: 400 });
    if (dateKeysBetween(body.startDate, body.endDate).length > 186) {
      return NextResponse.json({ error: "Période trop longue (6 mois au plus)." }, { status: 400 });
    }
    if (!(await getAccessibleVenueIds(session)).includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }
    for (const id of body.groupIds) {
      if (!(await groupBelongsToVenue(id, body.venueId))) {
        return NextResponse.json({ error: "Groupe inconnu pour ce point de vente." }, { status: 400 });
      }
    }
    const blocks = generateBlocks(body);
    await replaceRange(body.venueId, body.startDate, body.endDate, blocks);
    await logAudit({
      userId: session.userId, venueId: body.venueId, action: "create", entity: "shift_plan",
      details: { generated: true, ...body, blocks: blocks.length },
    });
    return NextResponse.json({ ok: true, blocks: blocks.length, until: addDays(body.endDate, 0) });
  } catch (error) {
    return handleApiError(error);
  }
}
