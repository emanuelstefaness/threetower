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
    valorImovel?: number | null;
    valorM2?: number | null;
    precificacao?: string | null;
    faixa?: string | null;
    baseCalculoVenda?: number | null;
  };
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "admin";

  const optFinite = (v: unknown, label: string): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    throw new Error(`${label} inválido`);
  };

  try {
    const updated: RoomRecord = store.updateRoomDetails({
      roomId,
      name: typeof body.name === "string" ? body.name : undefined,
      area: typeof body.area === "number" ? body.area : undefined,
      planSlot: typeof body.planSlot === "string" ? body.planSlot : undefined,
      statusSala: typeof body.statusSala === "string" ? body.statusSala : undefined,
      by,
      valorImovel: optFinite(body.valorImovel, "Valor do imóvel"),
      valorM2: optFinite(body.valorM2, "Valor m²"),
      baseCalculoVenda: optFinite(body.baseCalculoVenda, "Base cálculo"),
      precificacao:
        body.precificacao === undefined
          ? undefined
          : body.precificacao === null
            ? null
            : typeof body.precificacao === "string"
              ? body.precificacao
              : (() => {
                  throw new Error("Precificação inválida");
                })(),
      faixa:
        body.faixa === undefined ? undefined : body.faixa === null ? null : typeof body.faixa === "string" ? body.faixa : (() => {
            throw new Error("Faixa inválida");
          })(),
    });
    return Response.json({ updated });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 400 });
  }
}

