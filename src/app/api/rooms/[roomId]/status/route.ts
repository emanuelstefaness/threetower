import { getBuildingStore } from "@/server/building/buildingStore";
import { rejectIfSecretaria, rejectIfViewMode } from "@/server/mutationGuard";
import type { RoomStatus } from "@/lib/buildingTypes";

export async function PATCH(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const denied = await rejectIfViewMode();
  if (denied) return denied;
  const sec = await rejectIfSecretaria();
  if (sec) return sec;

  const store = await getBuildingStore();
  const roomId = Number(params.roomId);
  if (!Number.isFinite(roomId)) return Response.json({ error: "roomId inválido" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { status?: RoomStatus; by?: string };
  const newStatus = body.status;
  if (!newStatus) return Response.json({ error: "status é obrigatório" }, { status: 400 });

  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "admin";
  try {
    const evt = store.updateRoomStatus(roomId, newStatus, by);
    return Response.json(evt);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

