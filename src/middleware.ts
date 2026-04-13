import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthSecret } from "@/lib/authConfig";
import { verifyJwtHs256Edge } from "@/lib/jwtHs256Edge";
import { TV_PANEL_LOGIN } from "@/lib/authUi";
import { AUTH_COOKIE_NAME } from "@/server/auth/constants";

export async function middleware(request: NextRequest) {
  const secret = getAuthSecret();
  if (!secret) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/instance") ||
    pathname.startsWith("/api/auth/config")
  ) {
    return NextResponse.next();
  }

  // Admin com Bearer EXCEL_SYNC_SECRET (sem cookie de sessão)
  if (pathname.startsWith("/api/admin/sync-excel") || pathname.startsWith("/api/admin/reapply-seed")) {
    return NextResponse.next();
  }

  function middlewareRole(payload: Record<string, unknown>): string | null {
    const r = payload.role;
    if (r === "viewer" || r === "secretaria" || r === "gestor") return r as string;
    if (r === "editor") return "gestor";
    return null;
  }

  // Visitante e secretaria não acedem a Relatórios em produção; em `next dev` todos podem ver (visualização local).
  if (pathname.startsWith("/reports") && secret && process.env.NODE_ENV !== "development") {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const v = await verifyJwtHs256Edge(token, secret);
      if (v.ok) {
        const mr = middlewareRole(v.payload);
        if (mr === "viewer" || mr === "secretaria") {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  // Painel TV (/panel): só o utilizador com login configurado (ex.: dubena no APP_USERS_JSON)
  if (pathname.startsWith("/panel") && secret) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const v = await verifyJwtHs256Edge(token, secret);
      if (v.ok) {
        const raw = v.payload.login;
        const login = typeof raw === "string" ? raw.trim().toLowerCase() : "";
        if (login !== TV_PANEL_LOGIN) {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  // Caixa de entrada (salas reservadas): só gestores
  if (pathname.startsWith("/inbox") && secret) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const v = await verifyJwtHs256Edge(token, secret);
      if (v.ok) {
        const mr = middlewareRole(v.payload);
        if (mr !== "gestor") {
          const url = request.nextUrl.clone();
          url.pathname = "/";
          url.search = "";
          return NextResponse.redirect(url);
        }
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
