import { isAuthEnabled } from "@/lib/authConfig";
import { isAdminGestor } from "@/lib/authUi";
import type { NicheDef } from "@/lib/buildingTypes";
import {
  ensureBuildingStoreSyncedFromDb,
  flushBuildingPersistence,
} from "@/server/building/buildingStore";
import { getAuthSession } from "@/server/auth/getAuthRole";
import { rejectIfViewMode } from "@/server/mutationGuard";

export const dynamic = "force-dynamic";

/** Catálogo de nichos — leitura pública (usado na planta, no cadastro e no dashboard). */
export async function GET(): Promise<Response> {
  const store = await ensureBuildingStoreSyncedFromDb();
  return Response.json({ niches: store.getNiches() });
}

/** Atualiza o catálogo de nichos — só o gestor-admin (Juliany) quando a auth está ativa. */
export async function PUT(req: Request): Promise<Response> {
  const denied = await rejectIfViewMode();
  if (denied) return denied;

  const session = await getAuthSession();
  const isAdmin = isAdminGestor(session?.role ?? null, session?.login ?? null);
  if (isAuthEnabled() && !isAdmin) {
    return Response.json(
      { error: "Apenas a administradora pode configurar os nichos." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { niches?: unknown };
  if (!Array.isArray(body.niches)) {
    return Response.json({ error: "Envie a lista de nichos em `niches`." }, { status: 400 });
  }

  const incoming = body.niches as NicheDef[];
  const store = await ensureBuildingStoreSyncedFromDb();
  const saved = store.setNiches(incoming);
  await flushBuildingPersistence();
  return Response.json({ niches: saved });
}
