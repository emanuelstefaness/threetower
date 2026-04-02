import { getEffectiveAppMode } from "@/server/auth/effectiveAppMode";

/** Se estiver em modo visualização, devolve resposta 403; caso contrário `null`. */
export async function rejectIfViewMode(): Promise<Response | null> {
  if ((await getEffectiveAppMode()) !== "view") return null;
  return Response.json({ error: "Modo somente leitura (visualização). Alterações não são permitidas." }, { status: 403 });
}
