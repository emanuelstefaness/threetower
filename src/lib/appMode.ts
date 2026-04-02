/** Modo da aplicação (definido no servidor via APP_MODE). */
export type AppMode = "view" | "edit";

/**
 * Servidor: `APP_MODE=view` — só leitura; mutações nas APIs retornam 403.
 * Valores aceites: `view`, `readonly`, `read-only` → visualização; qualquer outro → edição.
 */
export function getServerAppMode(): AppMode {
  const v = process.env.APP_MODE?.trim().toLowerCase();
  if (v === "view" || v === "readonly" || v === "read-only") return "view";
  return "edit";
}
