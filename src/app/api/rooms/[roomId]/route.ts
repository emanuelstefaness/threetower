import {
  ensureBuildingStoreSyncedFromDb,
  flushBuildingPersistence,
} from "@/server/building/buildingStore";
import { rejectIfSecretaria, rejectIfViewMode } from "@/server/mutationGuard";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: { roomId: string } }
): Promise<Response> {
  const denied = await rejectIfViewMode();
  if (denied) return denied;
  const sec = await rejectIfSecretaria();
  if (sec) return sec;

  const store = await ensureBuildingStoreSyncedFromDb();
  const roomId = Number(params.roomId);
  if (!Number.isFinite(roomId)) return Response.json({ error: "roomId inválido" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { by?: string };
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "admin";

  try {
    const result = store.deleteRoom({ roomId, by });
    await flushBuildingPersistence();
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    const locked = msg.includes("Não é possível excluir salas");
    return Response.json({ error: msg }, { status: locked ? 403 : 400 });
  }
}

