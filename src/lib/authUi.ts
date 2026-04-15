/** Papel exposto ao cliente (alinhado com JWT; `null` = auth desligado ou sessão sem papel). */
export type ClientAuthRole = "gestor" | "secretaria" | "viewer" | null;

/** Login (APP_USERS_JSON) que pode aceder à rota `/panel` (sala TV). */
export const TV_PANEL_LOGIN = "dubena";

export function canAccessTvPanel(authLogin: string | null | undefined): boolean {
  const l = typeof authLogin === "string" ? authLogin.trim().toLowerCase() : "";
  return l === TV_PANEL_LOGIN;
}

/** Relatórios e “Vendas por período”: só gestor quando a autenticação está ativa (como a caixa de entrada). */
export function canAccessReports(role: ClientAuthRole, authEnabled: boolean): boolean {
  if (!authEnabled) return true;
  return role === "gestor";
}

/** Caixa de entrada de reservas: só gestores quando a auth está ativa. */
export function canAccessInbox(role: ClientAuthRole, authEnabled: boolean): boolean {
  if (!authEnabled) return true;
  return role === "gestor";
}

export function isSecretaria(role: ClientAuthRole): boolean {
  return role === "secretaria";
}
