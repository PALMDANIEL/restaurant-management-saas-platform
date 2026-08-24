import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, desc, eq, inArray, or, isNull } from "drizzle-orm";
import { requireSession, getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getAccessibleVenueIds(session);
    if (venueIds.length === 0) return NextResponse.json({ notifications: [] });

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          inArray(notifications.venueId, venueIds),
          or(isNull(notifications.userId), eq(notifications.userId, session.userId))
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(30);

    return NextResponse.json({ notifications: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const venueIds = await getAccessibleVenueIds(session);
    const body = await req.json();
    if (body.markAllRead) {
      if (venueIds.length === 0) return NextResponse.json({ success: true });
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.read, false),
            inArray(notifications.venueId, venueIds),
            or(isNull(notifications.userId), eq(notifications.userId, session.userId))
          )
        );
      return NextResponse.json({ success: true });
    }
    if (body.id) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.id, body.id), inArray(notifications.venueId, venueIds)));
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
