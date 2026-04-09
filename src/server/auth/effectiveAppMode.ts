import { cookies } from "next/headers";
import type { AppMode } from "@/lib/appMode";
import { getServerAppMode } from "@/lib/appMode";
import { getAuthSecret, isAuthEnabled } from "@/lib/authConfig";
import { AUTH_COOKIE_NAME } from "./constants";
import { verifyAuthToken } from "./session";

/**
 * Modo efetivo: env global, depois papel na sessão (visitante = view; gestor e secretaria = edit).
 */
export async function getEffectiveAppMode(): Promise<AppMode> {
  if (getServerAppMode() === "view") return "view";
  if (!isAuthEnabled()) return "edit";

  const secret = getAuthSecret()!;
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return "view";

  const session = await verifyAuthToken(token, secret);
  if (!session) return "view";
  return session.role === "viewer" ? "view" : "edit";
}
