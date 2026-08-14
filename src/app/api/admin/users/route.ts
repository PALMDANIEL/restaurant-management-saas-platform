import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertPlatformAdmin } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

/** Liste tous les utilisateurs, toutes entreprises confondues (réservé à platform_admin). */
export async function GET() {
  try {
    const session = await requireSession();
    assertPlatformAdmin(session.role);

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        active: users.active,
        createdAt: users.createdAt,
        companyId: users.companyId,
        companyName: companies.name,
      })
      .from(users)
      .leftJoin(companies, eq(users.companyId, companies.id));

    return NextResponse.json({ users: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  companyId: z.number(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["super_admin", "gerant", "manager", "caissier", "serveuse"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

/** Crée un utilisateur dans l'entreprise de son choix — sert notamment à créer le premier
 * gérant/admin d'une entreprise qui vient d'être créée (aucun utilisateur ne peut encore s'y connecter). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    assertPlatformAdmin(session.role);
    const body = createSchema.parse(await req.json());

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, body.companyId))
      .limit(1);
    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
    }

    const passwordHash = await hashPassword(body.password);
    const [user] = await db
      .insert(users)
      .values({
        companyId: body.companyId,
        email: body.email.toLowerCase().trim(),
        passwordHash,
        role: body.role,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
      })
      .returning();

    await logAudit({
      userId: null,
      action: "create",
      entity: "user",
      entityId: user.id,
      details: { email: user.email, role: user.role, companyId: body.companyId, by: "platform_admin" },
    });

    return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  role: z.enum(["super_admin", "gerant", "manager", "caissier", "serveuse"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

/** Modifie un utilisateur existant (rôle, activation, réinitialisation de mot de passe), quelle que soit son entreprise. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    assertPlatformAdmin(session.role);
    const body = updateSchema.parse(await req.json());
    const { id, password, ...rest } = body;

    const updates: Record<string, unknown> = { ...rest };
    if (password) updates.passwordHash = await hashPassword(password);

    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    await logAudit({
      userId: null,
      action: "update",
      entity: "user",
      entityId: id,
      details: { ...rest, by: "platform_admin" },
    });

    return NextResponse.json({ user: { id: updated.id, email: updated.email } });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.object({
  id: z.number(),
  confirmEmail: z.string().min(1),
});

/**
 * Suppression définitive d'un utilisateur, quelle que soit son entreprise. Réservé au platform_admin.
 * On exige que l'email exact soit renvoyé en confirmation pour éviter une suppression accidentelle.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    assertPlatformAdmin(session.role);
    const body = deleteSchema.parse(await req.json());

    const [target] = await db.select().from(users).where(eq(users.id, body.id)).limit(1);
    if (!target) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    if (target.email.trim().toLowerCase() !== body.confirmEmail.trim().toLowerCase()) {
      return NextResponse.json(
        { error: "L'email saisi ne correspond pas à celui du compte" },
        { status: 400 }
      );
    }

    await db.delete(users).where(eq(users.id, body.id));

    await logAudit({
      userId: null,
      action: "delete",
      entity: "user",
      entityId: body.id,
      details: { email: target.email, role: target.role, by: "platform_admin" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
