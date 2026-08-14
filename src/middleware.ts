import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "maquis_session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "maquis-manager-dev-secret-change-me-in-production"
);

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health", "/api/companies/public"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith("/order/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/order-app");

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let isAuthenticated = false;
  let role: string | undefined;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      isAuthenticated = true;
      role = payload.role as string | undefined;
    } catch {
      isAuthenticated = false;
    }
  }

  if (!isPublic && !isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Écran d'administration plateforme : réservé au rôle platform_admin.
  if (pathname.startsWith("/admin") && isAuthenticated && role !== "platform_admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (pathname.startsWith("/api/admin") && isAuthenticated && role !== "platform_admin") {
    return NextResponse.json({ error: "Accès réservé à l'administrateur de la plateforme" }, { status: 403 });
  }

  // platform_admin n'a pas d'entreprise : on ne le laisse pas se perdre dans l'app opérationnelle.
  if (isAuthenticated && role === "platform_admin" && !pathname.startsWith("/admin") && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL(role === "platform_admin" ? "/admin" : "/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
