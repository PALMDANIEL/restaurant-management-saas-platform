import { NextResponse } from "next/server";
import { db } from "@/db";
import { userVenues, venues, auditLogs, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./rbac";
import type { SessionPayload } from "./auth";
import { ZodError } from "zod";

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError("Not authenticated");
  return session;
}

/**
 * Comme requireSession, mais pour les routes propres à une entreprise
 * (users, venues, servers, ventes, stock, ...). Rejette platform_admin,
 * qui n'a pas de companyId et doit passer par /api/admin/* à la place.
 */
export async function requireCompanySession(): Promise<
  SessionPayload & { companyId: number }
> {
  const session = await requireSession();
  if (session.companyId == null) {
    throw new ForbiddenError(
      "Ce compte administrateur plateforme n'a pas d'entreprise associée. Utilisez l'écran d'administration."
    );
  }
  return session as SessionPayload & { companyId: number };
}

export function handleApiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const message = first?.message ?? "Données invalides";
    return NextResponse.json({ error: message, fields: error.flatten().fieldErrors }, { status: 400 });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Erreur interne";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Returns the list of venue IDs a given user can access. */
export async function getAccessibleVenueIds(
  session: SessionPayload
): Promise<number[]> {
  if (session.companyId == null) return []; // platform_admin : n'a pas d'établissements propres
  if (session.role === "super_admin") {
    const all = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.companyId, session.companyId));
    return all.map((v) => v.id);
  }
  if (session.role === "gerant") {
    const all = await db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.companyId, session.companyId));
    return all.map((v) => v.id);
  }
  const assigned = await db
    .select({ venueId: userVenues.venueId })
    .from(userVenues)
    .where(eq(userVenues.userId, session.userId));
  return assigned.map((a) => a.venueId);
}

/** Resolves which venue IDs a request should query, based on the `venueId` search param ("all" or a numeric id). */
export async function getRequestVenueIds(
  session: SessionPayload,
  searchParams: URLSearchParams
): Promise<number[]> {
  const accessible = await getAccessibleVenueIds(session);
  const requested = searchParams.get("venueId");
  if (!requested || requested === "all") return accessible;
  const id = Number(requested);
  return accessible.includes(id) ? [id] : [];
}

/** Ensures the requested venueId is accessible to the session user; returns it (or the first accessible venue if omitted). */
export async function resolveVenueId(
  session: SessionPayload,
  requestedVenueId: number | null
): Promise<number | null> {
  const accessible = await getAccessibleVenueIds(session);
  if (accessible.length === 0) return null;
  if (requestedVenueId && accessible.includes(requestedVenueId)) {
    return requestedVenueId;
  }
  return accessible[0];
}

/** À utiliser partout où logAudit reçoit session.userId : platform_admin n'a pas de ligne
 * dans la table users (userId -1), donc passer sa valeur brute viole la clé étrangère. */
export function auditUserId(session: SessionPayload): number | null {
  return session.role === "platform_admin" ? null : session.userId;
}

export async function logAudit(params: {
  userId?: number | null;
  venueId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  details?: unknown;
  ipAddress?: string | null;
}) {
  await db.insert(auditLogs).values({
    userId: params.userId ?? null,
    venueId: params.venueId ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    details: params.details ? JSON.parse(JSON.stringify(params.details)) : null,
    ipAddress: params.ipAddress ?? null,
  });
}

export async function pushNotification(params: {
  venueId: number;
  userId?: number | null;
  type: "new_order" | "low_stock" | "out_of_stock" | "new_sale" | "new_customer" | "system";
  title: string;
  message: string;
}) {
  await db.insert(notifications).values({
    venueId: params.venueId,
    userId: params.userId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
  });
}
