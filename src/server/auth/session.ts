import { SignJWT, jwtVerify } from "jose";
import { getServerInstanceId } from "./serverInstance";

export type AuthRole = "editor" | "viewer";

export async function signAuthToken(role: AuthRole, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const claims: Record<string, string> = { role };
  if (process.env.NODE_ENV === "development") {
    claims.sid = getServerInstanceId();
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifyAuthToken(token: string, secret: string): Promise<{ role: AuthRole } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (process.env.NODE_ENV === "development") {
      const sid = payload.sid;
      if (typeof sid !== "string" || sid !== getServerInstanceId()) return null;
    }
    const r = payload.role;
    if (r === "editor" || r === "viewer") return { role: r };
    return null;
  } catch {
    return null;
  }
}
