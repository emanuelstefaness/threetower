import { getEffectiveAppMode } from "@/server/auth/effectiveAppMode";
import { getAuthSession } from "@/server/auth/getAuthRole";

/** Se estiver em modo visualização, devolve resposta 403; caso contrário `null`. */
export async function rejectIfViewMode(): Promise<Response | null> {
  if ((await getEffectiveAppMode()) !== "view") return null;
  return Response.json({ error: "Modo somente leitura (visualização). Alterações não são permitidas." }, { status: 403 });
}

/**
 * Operações estruturais (criar/excluir sala, mudança rápida de status operacional) — só gestor ou sessão legada sem papel (auth desligado).
 */
export async function rejectIfSecretaria(): Promise<Response | null> {
  const session = await getAuthSession();
  if (session?.role === "secretaria") {
    return Response.json({ error: "Esta ação é apenas para gestores." }, { status: 403 });
  }
  return null;
}
