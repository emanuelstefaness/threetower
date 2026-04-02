/**
 * Segredo para JWT/cookie. Em `next dev`, se `AUTH_SECRET` não estiver definido,
 * usa-se um valor local fixo para que o login seja sempre o primeiro ecrã.
 * Em produção (`next start` / Docker) só há login se definir `AUTH_SECRET`.
 */
const DEV_FALLBACK_SECRET = "__3TOWER_DEV_AUTH_SECRET_CHANGE_IN_PRODUCTION__";

export function getAuthSecret(): string | null {
  if (
    (process.env.DISABLE_AUTH === "1" || process.env.DISABLE_AUTH === "true") &&
    process.env.NODE_ENV !== "production"
  ) {
    return null;
  }

  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "development") return DEV_FALLBACK_SECRET;

  return null;
}

export function isAuthEnabled(): boolean {
  return getAuthSecret() !== null;
}
