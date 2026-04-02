import { getBuildingStore } from "@/server/building/buildingStore";
import { rejectIfViewMode } from "@/server/mutationGuard";
import type { RoomRecord } from "@/lib/buildingTypes";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { roomId: string } }
): Promise<Response> {
  const denied = await rejectIfViewMode();
  if (denied) return denied;

  const store = await getBuildingStore();
  const roomId = Number(params.roomId);
  if (!Number.isFinite(roomId)) return Response.json({ error: "roomId inválido" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    area?: number;
    by?: string;
    planSlot?: string;
    statusSala?: string;
  };
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "admin";

  try {
    const updated: RoomRecord = store.updateRoomDetails({
      roomId,
      name: typeof body.name === "string" ? body.name : undefined,
      area: typeof body.area === "number" ? body.area : undefined,
      planSlot: typeof body.planSlot === "string" ? body.planSlot : undefined,
      statusSala: typeof body.statusSala === "string" ? body.statusSala : undefined,
      by,
    });
    return Response.json({ updated });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

