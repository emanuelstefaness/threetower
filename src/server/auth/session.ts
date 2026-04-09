import { SignJWT, jwtVerify } from "jose";
import { getServerInstanceId } from "./serverInstance";

/** `gestor` = edição completa + relatórios; `secretaria` = reservas/detalhes, sem relatórios; `viewer` = visitante. */
export type AuthRole = "gestor" | "secretaria" | "viewer";

/** Normaliza JWT legado `editor` → gestor. */
function normalizeAuthRole(r: string | undefined): AuthRole | null {
  if (r === "viewer" || r === "secretaria" || r === "gestor") return r;
  if (r === "editor") return "gestor";
  return null;
}

export type AuthTokenPayload = {
  role: AuthRole;
  name: string;
  login: string;
};

export async function signAuthToken(secret: string, payload: AuthTokenPayload): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const claims: Record<string, string> = {
    role: payload.role,
    name: payload.name,
    login: payload.login,
  };
  if (process.env.NODE_ENV === "development") {
    claims.sid = getServerInstanceId();
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifyAuthToken(token: string, secret: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (process.env.NODE_ENV === "development") {
      const sid = payload.sid;
      if (typeof sid !== "string" || sid !== getServerInstanceId()) return null;
    }
    const role = normalizeAuthRole(typeof payload.role === "string" ? payload.role : undefined);
    if (!role) return null;
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Utilizador";
    const login = typeof payload.login === "string" ? payload.login.trim() : "";
    return { role, name, login };
  } catch {
    return null;
  }
}
