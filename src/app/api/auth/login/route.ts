import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getAuthSecret, isAuthEnabled } from "@/lib/authConfig";
import { AUTH_COOKIE_NAME } from "@/server/auth/constants";
import { findAppUser, hasNamedUsers } from "@/server/auth/appUsers";
import { signAuthToken } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashPw(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

function passwordsEqual(a: string, b: string): boolean {
  const ha = hashPw(a);
  const hb = hashPw(b);
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

export async function POST(req: Request) {
  const secret = getAuthSecret();
  if (!secret || !isAuthEnabled()) {
    return NextResponse.json({ error: "Autenticação não configurada (AUTH_SECRET)" }, { status: 501 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    password?: string;
    login?: string;
    asViewer?: boolean;
  };

  if (body.asViewer === true) {
    const token = await signAuthToken(secret, { role: "viewer", name: "Visitante", login: "" });
    return jsonWithSessionCookie(token);
  }

  if (hasNamedUsers()) {
    const login = typeof body.login === "string" ? body.login.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!login || !password) {
      return NextResponse.json({ error: "Indique utilizador e palavra-passe" }, { status: 400 });
    }
    const user = findAppUser(login, password);
    if (!user) {
      return NextResponse.json({ error: "Utilizador ou palavra-passe incorretos" }, { status: 401 });
    }
    const token = await signAuthToken(secret, {
      role: user.role,
      name: user.name,
      login: user.login,
    });
    return jsonWithSessionCookie(token);
  }

  const loginAttempt = typeof body.login === "string" ? body.login.trim() : "";
  if (loginAttempt) {
    return NextResponse.json(
      {
        error:
          "Este servidor não tem APP_USERS_JSON (utilizadores nomeados). Configure a variável no Vercel/Docker com dubena e outros, ou deixe o utilizador em branco e use só a palavra-passe global (APP_LOGIN_PASSWORD).",
      },
      { status: 400 }
    );
  }

  const expected = process.env.APP_LOGIN_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Login não configurado (defina APP_USERS_JSON ou APP_LOGIN_PASSWORD)" },
      { status: 503 }
    );
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!passwordsEqual(password, expected)) {
    return NextResponse.json({ error: "Palavra-passe incorreta" }, { status: 401 });
  }

  const token = await signAuthToken(secret, { role: "gestor", name: "Gestor", login: "gestor" });
  return jsonWithSessionCookie(token);
}

function jsonWithSessionCookie(token: string): NextResponse {
  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
