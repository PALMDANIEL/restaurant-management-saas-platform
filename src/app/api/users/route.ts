import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, userVenues, companies } from "@/db/schema";
import { and, eq, inArray, count } from "drizzle-orm";
import { requireCompanySession, handleApiError, logAudit } from "@/lib/api-helpers";
import { assertCan, can } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    if (!can(session.role, "manageUsers") && !can(session.role, "manageServers")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const roleFilter = req.nextUrl.searchParams.get("role");

    const rows = await db.select().from(users).where(eq(users.companyId, session.companyId));
    const canManageAll = can(session.role, "manageUsers");
    const effectiveRoleFilter = canManageAll ? roleFilter : "serveuse";
    const filtered = effectiveRoleFilter ? rows.filter((u) => u.role === effectiveRoleFilter) : rows;

    const userIds = filtered.map((u) => u.id);
    const assignments = userIds.length
      ? await db.select().from(userVenues).where(inArray(userVenues.userId, userIds))
      : [];

    const safe = filtered.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      active: u.active,
      matricule: u.matricule,
      createdAt: u.createdAt,
      venueIds: assignments.filter((a) => a.userId === u.id).map((a) => a.venueId),
    }));

    const [company] = await db
      .select({ maxUsers: companies.maxUsers })
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    return NextResponse.json({
      users: safe,
      seatUsage: { used: rows.length, max: company?.maxUsers ?? null },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["super_admin", "gerant", "manager", "caissier", "serveuse"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  matricule: z.string().optional(),
  venueIds: z.array(z.number()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    const body = createSchema.parse(await req.json());
    assertCan(session.role, body.role === "serveuse" ? "manageServers" : "manageUsers");

    const [company] = await db
      .select({ maxUsers: companies.maxUsers })
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    if (company?.maxUsers != null) {
      const [{ value: currentCount }] = await db
        .select({ value: count() })
        .from(users)
        .where(eq(users.companyId, session.companyId));

      if (currentCount >= company.maxUsers) {
        return NextResponse.json(
          { error: `Quota de licences atteint (${company.maxUsers} utilisateur${company.maxUsers > 1 ? "s" : ""} maximum). Contactez votre administrateur pour l'augmenter.` },
          { status: 403 }
        );
      }
    }

    const passwordHash = await hashPassword(body.password);
    const [user] = await db
      .insert(users)
      .values({
        companyId: session.companyId,
        email: body.email,
        passwordHash,
        role: body.role,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        matricule: body.matricule,
      })
      .returning();

    if (body.venueIds.length > 0) {
      await db.insert(userVenues).values(body.venueIds.map((venueId) => ({ userId: user.id, venueId })));
    }

    await logAudit({ userId: session.userId, action: "create", entity: "user", entityId: user.id, details: { email: body.email, role: body.role } });
    return NextResponse.json({ user: { id: user.id, email: user.email } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({
  id: z.number(),
  role: z.enum(["super_admin", "gerant", "manager", "caissier", "serveuse"]).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  matricule: z.string().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  venueIds: z.array(z.number()).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireCompanySession();
    const body = updateSchema.parse(await req.json());
    const { id, password, venueIds, ...rest } = body;

    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    assertCan(session.role, target.role === "serveuse" && !rest.role ? "manageServers" : "manageUsers");

    const updates: Record<string, unknown> = { ...rest };
    if (password) updates.passwordHash = await hashPassword(password);

    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    if (venueIds) {
      await db.delete(userVenues).where(eq(userVenues.userId, id));
      if (venueIds.length > 0) {
        await db.insert(userVenues).values(venueIds.map((venueId) => ({ userId: id, venueId })));
      }
    }

    await logAudit({ userId: session.userId, action: "update", entity: "user", entityId: id, details: rest });
    return NextResponse.json({ user: { id: updated.id, email: updated.email } });
  } catch (error) {
    return handleApiError(error);
  }
}
