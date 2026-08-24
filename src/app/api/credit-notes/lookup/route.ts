import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { creditNotes, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const code = (req.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "Code manquant" }, { status: 400 });

    const [note] = await db.select().from(creditNotes).where(eq(creditNotes.code, code)).limit(1);
    if (!note) return NextResponse.json({ error: "Avoir introuvable" }, { status: 404 });

    const accessible = await getAccessibleVenueIds(session);
    if (!accessible.includes(note.venueId)) {
      return NextResponse.json({ error: "Avoir introuvable" }, { status: 404 });
    }

    let customerName: string | null = null;
    if (note.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, note.customerId)).limit(1);
      customerName = c?.name ?? null;
    }

    return NextResponse.json({
      creditNote: {
        id: note.id,
        code: note.code,
        venueId: note.venueId,
        amount: note.amount,
        remainingAmount: note.remainingAmount,
        status: note.status,
        customerName,
        createdAt: note.createdAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
