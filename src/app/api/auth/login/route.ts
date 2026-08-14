import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/api-helpers";
import { checkLicense } from "@/lib/license";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  companyId: z.number(),
});

// Identifiants du compte d'administration de la plateforme (toutes entreprises confondues).
// Ne jamais committer le vrai mot de passe : PLATFORM_ADMIN_PASSWORD_HASH doit venir des
// variables d'environnement en production. Les valeurs ci-dessous ne servent que de secours en dev.
const PLATFORM_ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL || "superadmingmaki@ait.com")
  .toLowerCase()
  .trim();
const PLATFORM_ADMIN_PASSWORD_HASH =
  process.env.PLATFORM_ADMIN_PASSWORD_HASH ||
  "$2b$10$gqLJdlProPF742IcRd4QBOSGluC4gTppPzw3R6X2734d933a8jfUm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, companyId } = schema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();

    // Chemin admin plateforme : indépendant de l'entreprise choisie sur l'écran de connexion,
    // et indépendant du statut de licence de quelque entreprise que ce soit.
    if (normalizedEmail === PLATFORM_ADMIN_EMAIL) {
      const valid = await verifyPassword(password, PLATFORM_ADMIN_PASSWORD_HASH);
      if (!valid) {
        return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
      }

      const token = await createSessionToken({
        userId: -1,
        companyId: null,
        role: "platform_admin",
        email: PLATFORM_ADMIN_EMAIL,
        firstName: "Super",
        lastName: "Admin",
      });
      await setSessionCookie(token);

      await logAudit({
        userId: null,
        action: "login",
        entity: "auth",
        details: { role: "platform_admin" },
        ipAddress: req.headers.get("x-forwarded-for"),
      });

      return NextResponse.json({
        user: {
          id: -1,
          email: PLATFORM_ADMIN_EMAIL,
          role: "platform_admin",
          firstName: "Super",
          lastName: "Admin",
          photoUrl: null,
        },
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user || !user.active || user.companyId !== companyId) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    const [companyRow] = await db
      .select({ licenseStatus: companies.licenseStatus, licenseExpiresAt: companies.licenseExpiresAt })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const license = checkLicense(
      companyRow ?? { licenseStatus: "suspended", licenseExpiresAt: null }
    );
    if (!license.accessible) {
      return NextResponse.json({ error: license.message }, { status: 403 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    const token = await createSessionToken({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    await setSessionCookie(token);

    await logAudit({
      userId: user.id,
      action: "login",
      entity: "auth",
      ipAddress: req.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Email ou mot de passe invalide" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
