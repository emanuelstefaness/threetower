import { createHash, timingSafeEqual } from "crypto";

export type AppUserRow = {
  login: string;
  password: string;
  role: "gestor" | "secretaria";
  name: string;
};

function hashPw(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

function passwordsEqual(a: string, b: string): boolean {
  const ha = hashPw(a);
  const hb = hashPw(b);
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

/**
 * Utilizadores nomeados (gestores e secretários). JSON em `APP_USERS_JSON` (uma linha).
 * Ex.: [{"login":"pedro","password":"...","role":"gestor","name":"Pedro"},...]
 */
export function loadAppUsersFromEnv(): AppUserRow[] {
  const raw = process.env.APP_USERS_JSON?.trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: AppUserRow[] = [];
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const login = typeof o.login === "string" ? o.login.trim().toLowerCase() : "";
      const password = typeof o.password === "string" ? o.password : "";
      const role = o.role === "gestor" || o.role === "secretaria" ? o.role : null;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!login || !password || !role || !name) continue;
      out.push({ login, password, role, name });
    }
    return out;
  } catch {
    return [];
  }
}

export function findAppUser(login: string, password: string): AppUserRow | null {
  const l = login.trim().toLowerCase();
  if (!l) return null;
  const users = loadAppUsersFromEnv();
  for (const u of users) {
    if (u.login === l && passwordsEqual(password, u.password)) return u;
  }
  return null;
}

export function hasNamedUsers(): boolean {
  return loadAppUsersFromEnv().length > 0;
}
