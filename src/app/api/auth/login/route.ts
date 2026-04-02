import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getAuthSecret, isAuthEnabled } from "@/lib/authConfig";
import { AUTH_COOKIE_NAME } from "@/server/auth/constants";
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

  const body = (await req.json().catch(() => ({}))) as { password?: string; asViewer?: boolean };

  if (body.asViewer === true) {
    const token = await signAuthToken("viewer", secret);
    return jsonWithSessionCookie(token);
  }

  const expected = process.env.APP_LOGIN_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Login com palavra-passe não configurado (defina APP_LOGIN_PASSWORD)" },
      { status: 503 }
    );
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!passwordsEqual(password, expected)) {
    return NextResponse.json({ error: "Palavra-passe incorreta" }, { status: 401 });
  }

  const token = await signAuthToken("editor", secret);
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
