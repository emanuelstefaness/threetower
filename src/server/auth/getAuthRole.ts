import { cookies } from "next/headers";
import { getAuthSecret, isAuthEnabled } from "@/lib/authConfig";
import { AUTH_COOKIE_NAME } from "@/server/auth/constants";
import type { AuthRole } from "@/server/auth/session";
import { verifyAuthToken } from "@/server/auth/session";

export type AuthSession = {
  role: AuthRole;
  name: string;
  login: string;
};

/** Sessão completa ou `null` (sem cookie / auth desligado / token inválido). */
export async function getAuthSession(): Promise<AuthSession | null> {
  if (!isAuthEnabled()) return null;
  const secret = getAuthSecret();
  if (!secret) return null;
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAuthToken(token, secret);
}

/** Apenas o papel; `null` = sem sessão ou auth desligado (UI trata como acesso completo ao payload). */
export async function getAuthRole(): Promise<AuthRole | null> {
  const s = await getAuthSession();
  return s?.role ?? null;
}
