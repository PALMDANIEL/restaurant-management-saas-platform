import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireCompanySession, handleApiError, logAudit } from "@/lib/api-helpers";
import { ForbiddenError } from "@/lib/rbac";

/** Les clés du compte marchand LigdiCash ne sont gérées que par le propriétaire de l'entreprise. */
async function ownerSession() {
  const session = await requireCompanySession();
  if (session.role !== "super_admin") {
    throw new ForbiddenError("Seul le propriétaire de l'entreprise peut gérer le compte LigdiCash.");
  }
  return session;
}

/** N'expose jamais les clés : seulement si elles sont renseignées et leurs derniers caractères. */
function summary(row: { ligdicashApiKey: string | null; ligdicashAuthToken: string | null; ligdicashLive: boolean }) {
  return {
    configured: !!(row.ligdicashApiKey && row.ligdicashAuthToken),
    apiKeyHint: row.ligdicashApiKey ? `…${row.ligdicashApiKey.slice(-4)}` : null,
    live: row.ligdicashLive,
  };
}

const columns = {
  ligdicashApiKey: companies.ligdicashApiKey,
  ligdicashAuthToken: companies.ligdicashAuthToken,
  ligdicashLive: companies.ligdicashLive,
};

export async function GET() {
  try {
    const session = await ownerSession();
    const [row] = await db.select(columns).from(companies).where(eq(companies.id, session.companyId)).limit(1);
    if (!row) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    return NextResponse.json({ ligdicash: summary(row) });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  // Champ vide ou absent : la clé enregistrée est conservée.
  apiKey: z.string().trim().optional(),
  authToken: z.string().trim().optional(),
  live: z.boolean().optional(),
  remove: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const session = await ownerSession();
    const body = updateSchema.parse(await req.json());
    const updates: Partial<typeof companies.$inferInsert> = {};
    if (body.remove) {
      updates.ligdicashApiKey = null;
      updates.ligdicashAuthToken = null;
      updates.ligdicashLive = false;
    } else {
      if (body.apiKey) updates.ligdicashApiKey = body.apiKey;
      if (body.authToken) updates.ligdicashAuthToken = body.authToken;
      if (body.live !== undefined) updates.ligdicashLive = body.live;
    }
    const [row] = Object.keys(updates).length
      ? await db.update(companies).set(updates).where(eq(companies.id, session.companyId)).returning()
      : await db.select(columns).from(companies).where(eq(companies.id, session.companyId)).limit(1);
    if (!row) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    await logAudit({
      userId: session.userId,
      action: "update",
      entity: "ligdicash_settings",
      entityId: session.companyId,
      details: { removed: !!body.remove, keysChanged: !!(body.apiKey || body.authToken), live: row.ligdicashLive },
    });
    return NextResponse.json({ ligdicash: summary(row) });
  } catch (error) {
    return handleApiError(error);
  }
}
