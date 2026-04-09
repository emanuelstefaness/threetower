import { getBuildingStore } from "@/server/building/buildingStore";
import { rejectIfSecretaria, rejectIfViewMode } from "@/server/mutationGuard";
import type { RoomStatus, RoomRecord } from "@/lib/buildingTypes";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { floor: string } }
): Promise<Response> {
  const denied = await rejectIfViewMode();
  if (denied) return denied;
  const sec = await rejectIfSecretaria();
  if (sec) return sec;

  const store = await getBuildingStore();
  const floor = Number(params.floor);
  if (!Number.isFinite(floor)) return Response.json({ error: "floor inválido" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    status?: RoomStatus;
    count?: number;
    name?: string;
    area?: number;
    namePrefix?: string;
    planSlot?: string;
    by?: string;
  };

  const status = body.status;
  const count = typeof body.count === "number" && Number.isFinite(body.count) ? Math.floor(body.count) : 1;
  const providedName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  const area = typeof body.area === "number" && Number.isFinite(body.area) ? body.area : 25;
  const namePrefix = typeof body.namePrefix === "string" && body.namePrefix.trim() ? body.namePrefix.trim() : `Sala ${floor}`;
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "admin";
  const planSlot = typeof body.planSlot === "string" && body.planSlot.trim() ? body.planSlot.trim() : undefined;

  if (!status) return Response.json({ error: "status é obrigatório" }, { status: 400 });
  if (count <= 0) return Response.json({ error: "count inválido" }, { status: 400 });
  if (area <= 0) return Response.json({ error: "area inválida" }, { status: 400 });

  try {
    const created: RoomRecord[] = store.createRooms({
      floor,
      status,
      count,
      area,
      namePrefix,
      planSlot,
      by,
    });

    // Se for criação unitária com nome explícito, ajusta o nome do primeiro.
    // (Mantém compatibilidade com o endpoint mesmo sem uma template completa.)
    if (providedName && created[0]) {
      created[0].name = providedName;
    }
    return Response.json({ created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    const locked = msg.includes("Não é possível criar novas salas");
    return Response.json({ error: msg }, { status: locked ? 403 : 400 });
  }
}

