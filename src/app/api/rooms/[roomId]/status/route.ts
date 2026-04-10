import { isAuthEnabled } from "@/lib/authConfig";
import type { RoomStatus } from "@/lib/buildingTypes";
import { getAuthSession } from "@/server/auth/getAuthRole";
import {
  ensureBuildingStoreSyncedFromDb,
  flushBuildingPersistence,
} from "@/server/building/buildingStore";
import { rejectIfSecretaria, rejectIfViewMode } from "@/server/mutationGuard";

export async function PATCH(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const denied = await rejectIfViewMode();
  if (denied) return denied;
  const sec = await rejectIfSecretaria();
  if (sec) return sec;

  const store = await ensureBuildingStoreSyncedFromDb();
  const roomId = Number(params.roomId);
  if (!Number.isFinite(roomId)) return Response.json({ error: "roomId inválido" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { status?: RoomStatus; by?: string };
  const newStatus = body.status;
  if (!newStatus) return Response.json({ error: "status é obrigatório" }, { status: 400 });

  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "admin";
  const session = await getAuthSession();
  const reserveBy =
    session && (session.role === "gestor" || session.role === "secretaria")
      ? { name: session.name, login: session.login }
      : !isAuthEnabled()
        ? { name: by, login: "local" }
        : { name: by, login: "" };

  try {
    const evt = store.updateRoomStatus(
      roomId,
      newStatus,
      by,
      newStatus === "reservada" ? { reserveBy } : undefined
    );
    await flushBuildingPersistence();
    return Response.json(evt);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

