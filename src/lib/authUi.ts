/** Papel exposto ao cliente (alinhado com JWT; `null` = auth desligado ou sessão sem papel). */
export type ClientAuthRole = "gestor" | "secretaria" | "viewer" | null;

export function canAccessReports(role: ClientAuthRole): boolean {
  return role !== "viewer" && role !== "secretaria";
}

/** Caixa de entrada de reservas: só gestores quando a auth está ativa. */
export function canAccessInbox(role: ClientAuthRole, authEnabled: boolean): boolean {
  if (!authEnabled) return true;
  return role === "gestor";
}

export function isSecretaria(role: ClientAuthRole): boolean {
  return role === "secretaria";
}
