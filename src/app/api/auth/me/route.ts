import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users, venues, userVenues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAccessibleVenueIds, handleApiError } from "@/lib/api-helpers";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  // Le compte platform_admin n'existe pas dans la table users (il n'est rattaché à aucune entreprise).
  if (session.role === "platform_admin") {
    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        role: session.role,
        firstName: session.firstName,
        lastName: session.lastName,
        photoUrl: null,
        companyId: null,
        matricule: null,
      },
      venues: [],
    });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const venueIds = await getAccessibleVenueIds(session);
  const accessibleVenues =
    venueIds.length && session.companyId != null
      ? await db.select().from(venues).where(eq(venues.companyId, session.companyId))
      : [];

  const filteredVenues = accessibleVenues.filter((v) => venueIds.includes(v.id));

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl,
      companyId: user.companyId,
      matricule: user.matricule,
    },
    venues: filteredVenues,
  });
}

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const body = updateSchema.parse(await req.json());

    const [existing] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!existing) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (body.firstName) updates.firstName = body.firstName;
    if (body.lastName) updates.lastName = body.lastName;
    if (body.phone !== undefined) updates.phone = body.phone;

    if (body.newPassword) {
      if (!body.currentPassword || !(await verifyPassword(body.currentPassword, existing.passwordHash))) {
        return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 400 });
      }
      updates.passwordHash = await hashPassword(body.newPassword);
    }

    const [updated] = await db.update(users).set(updates).where(eq(users.id, session.userId)).returning();
    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        firstName: updated.firstName,
        lastName: updated.lastName,
        photoUrl: updated.photoUrl,
        companyId: updated.companyId,
        matricule: updated.matricule,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

