import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthSecret } from "@/lib/authConfig";
import { verifyJwtHs256Edge } from "@/lib/jwtHs256Edge";
import { AUTH_COOKIE_NAME } from "@/server/auth/constants";

export async function middleware(request: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/instance")
  ) {
    return NextResponse.next();
  }

  // Admin com Bearer EXCEL_SYNC_SECRET (sem cookie de sessão)
  if (pathname.startsWith("/api/admin/sync-excel") || pathname.startsWith("/api/admin/reapply-seed")) {
    return NextResponse.next();
  }

  // Visitante (JWT role viewer) não acede a Relatórios
  if (pathname.startsWith("/reports") && secret) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const v = await verifyJwtHs256Edge(token, secret);
      if (v.ok && v.payload.role === "viewer") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const verified = await verifyJwtHs256Edge(token, secret).catch((): { ok: false } => ({ ok: false }));
  if (!verified.ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão inválida ou expirada" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (process.env.NODE_ENV === "development") {
    const sid = verified.payload.sid;
    if (typeof sid !== "string") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Sessão inválida (reinicie o login)" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    try {
      const origin = request.nextUrl.origin;
      const ir = await fetch(`${origin}/api/auth/instance`, {
        cache: "no-store",
        headers: { "x-middleware-check": "1" },
      });
      const live = (await ir.json()) as { sid?: string };
      if (!ir.ok || live.sid !== sid) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Servidor reiniciado — inicie sessão novamente" }, { status: 401 });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }
    } catch {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Não foi possível validar a sessão" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
