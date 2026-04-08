import { cookies } from "next/headers";
import { getAuthSecret, isAuthEnabled } from "@/lib/authConfig";
import { AUTH_COOKIE_NAME } from "@/server/auth/constants";
import type { AuthRole } from "@/server/auth/session";
import { verifyAuthToken } from "@/server/auth/session";

/** `null` = sem sessão ou auth desligado (UI trata como acesso completo ao payload). */
export async function getAuthRole(): Promise<AuthRole | null> {
  if (!isAuthEnabled()) return null;
  const secret = getAuthSecret();
  if (!secret) return null;
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifyAuthToken(token, secret);
  return session?.role ?? null;
}
