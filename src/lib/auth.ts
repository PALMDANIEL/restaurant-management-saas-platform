import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export type Role =
  | "platform_admin"
  | "super_admin"
  | "gerant"
  | "manager"
  | "caissier"
  | "serveuse";

export type SessionPayload = {
  userId: number;
  // null uniquement pour platform_admin : ce compte n'appartient à aucune entreprise.
  companyId: number | null;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
};

const SESSION_COOKIE = "maquis_session";

// En production, AUTH_SECRET doit impérativement venir des variables d'environnement : un
// secret par défaut connu de tous permettrait de forger des sessions (n'importe quel rôle,
// n'importe quelle entreprise). On échoue donc au démarrage plutôt que de démarrer avec une
// valeur non sûre. En développement, on garde un secret de secours pratique.
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  throw new Error(
    "AUTH_SECRET doit être défini en production (variable d'environnement manquante)."
  );
}
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "maquis-manager-dev-secret-change-me-in-production"
);
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(SECRET);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
