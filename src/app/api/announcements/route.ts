import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireCompanySession, getAccessibleVenueIds, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

const createSchema = z.object({
  venueId: z.number(),
  title: z.string().trim().min(1, "Titre requis").max(150),
  body: z.string().trim().min(1, "Texte requis").max(4000),
  pinned: z.boolean().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const body = createSchema.parse(await req.json());
    if (!(await getAccessibleVenueIds(session)).includes(body.venueId)) {
      return NextResponse.json({ error: "Point de vente introuvable" }, { status: 404 });
    }
    const [announcement] = await db
      .insert(announcements)
      .values({
        venueId: body.venueId, title: body.title, body: body.body, pinned: body.pinned ?? false,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, createdBy: session.userId,
      })
      .returning();
    await logAudit({ userId: session.userId, venueId: body.venueId, action: "create", entity: "announcement", entityId: announcement.id, details: { title: body.title } });
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    assertCan(session.role, "manageServers");
    const id = Number(req.nextUrl.searchParams.get("id"));
    const [existing] = id ? await db.select().from(announcements).where(eq(announcements.id, id)).limit(1) : [];
    if (!existing || !(await getAccessibleVenueIds(session)).includes(existing.venueId)) {
      return NextResponse.json({ error: "Info introuvable" }, { status: 404 });
    }
    await db.delete(announcements).where(eq(announcements.id, id));
    await logAudit({ userId: session.userId, venueId: existing.venueId, action: "delete", entity: "announcement", entityId: id, details: { title: existing.title } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
