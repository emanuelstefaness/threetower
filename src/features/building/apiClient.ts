import type { AppMode } from "@/lib/appMode";
import type { ClientAuthRole } from "@/lib/authUi";
import type { BuildingSnapshot, RoomRecord, RoomStatus, RoomStatusChangedEvent } from "@/lib/buildingTypes";

function normalizeClientAuthRole(r: string | undefined): ClientAuthRole {
  if (r === "gestor" || r === "secretaria" || r === "viewer") return r;
  if (r === "editor") return "gestor";
  return null;
}

export type BuildingStatePayload = {
  snapshot: BuildingSnapshot;
  appMode: AppMode;
  authEnabled?: boolean;
  authRole?: ClientAuthRole;
  authName?: string;
  /** Login da sessão (APP_USERS_JSON), para regras de UI (ex. Painel TV). */
  authLogin?: string;
};

export async function fetchBuildingState(): Promise<BuildingStatePayload> {
  const res = await fetch("/api/state", { method: "GET" });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}`);
    }
    throw new Error("Sessão expirada ou não autenticado");
  }
  if (!res.ok) throw new Error("Falha ao carregar estado do prédio");
  const data = (await res.json()) as unknown;
  if (
    data &&
    typeof data === "object" &&
    "snapshot" in data &&
    "appMode" in data &&
    (data as { appMode: string }).appMode
  ) {
    const d = data as {
      snapshot: BuildingSnapshot;
      appMode: AppMode;
      authEnabled?: boolean;
      authRole?: string;
      authName?: string;
      authLogin?: string;
    };
    return {
      snapshot: d.snapshot,
      appMode: d.appMode,
      authEnabled: d.authEnabled === true,
      authRole: normalizeClientAuthRole(d.authRole),
      authName: typeof d.authName === "string" ? d.authName : undefined,
      authLogin: typeof d.authLogin === "string" ? d.authLogin : undefined,
    };
  }
  return { snapshot: data as BuildingSnapshot, appMode: "edit" };
}

export async function updateRoomStatus(roomId: number, status: RoomStatus, by: string = "admin"): Promise<RoomStatusChangedEvent> {
  const res = await fetch(`/api/rooms/${roomId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, by }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "Falha ao atualizar sala");
  }
  return (await res.json()) as RoomStatusChangedEvent;
}

export async function createRoomsForFloor(args: {
  floor: number;
  status: RoomStatus;
  count: number;
  area: number;
  name?: string;
  namePrefix?: string;
  planSlot?: string;
  by?: string;
}): Promise<{ created: RoomRecord[] }> {
  const res = await fetch(`/api/floors/${args.floor}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: args.status,
      count: args.count,
      area: args.area,
      name: args.name,
      namePrefix: args.namePrefix,
      planSlot: args.planSlot,
      by: args.by ?? "admin",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "Falha ao criar salas");
  }
  return (await res.json()) as { created: RoomRecord[] };
}

export type UpdateRoomDetailsPayload = {
  name?: string;
  area?: number;
  planSlot?: string;
  statusSala?: string;
  by?: string;
  valorImovel?: number | null;
  valorM2?: number | null;
  precificacao?: string | null;
  faixa?: string | null;
  baseCalculoVenda?: number | null;
  corretor?: string | null;
  imobiliaria?: string | null;
  comprador?: string | null;
  formaPagamento?: string | null;
  prazoPagamento?: string | null;
  valorVenda?: number | null;
  descontos?: number | null;
  /** Epoch ms — data da venda (status VENDIDO). */
  dataVenda?: number | null;
  /** Campo de preço que o gestor alterou por último no modal. */
  priceSource?: "valorM2" | "valorImovel" | null;
};

export async function updateRoomDetails(roomId: number, args: UpdateRoomDetailsPayload): Promise<{ updated: RoomRecord }> {
  const res = await fetch(`/api/rooms/${roomId}/details`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: args.name,
      area: args.area,
      planSlot: args.planSlot,
      statusSala: args.statusSala,
      by: args.by ?? "admin",
      valorImovel: args.valorImovel,
      valorM2: args.valorM2,
      precificacao: args.precificacao,
      faixa: args.faixa,
      baseCalculoVenda: args.baseCalculoVenda,
      corretor: args.corretor,
      imobiliaria: args.imobiliaria,
      comprador: args.comprador,
      formaPagamento: args.formaPagamento,
      prazoPagamento: args.prazoPagamento,
      valorVenda: args.valorVenda,
      descontos: args.descontos,
      dataVenda: args.dataVenda,
      priceSource: args.priceSource,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "Falha ao atualizar detalhes da sala");
  }
  return (await res.json()) as { updated: RoomRecord };
}

export async function deleteRoom(roomId: number, by: string = "admin"): Promise<{ ok: true; deletedRoomId: number; floor: number }> {
  const res = await fetch(`/api/rooms/${roomId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ by }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "Falha ao excluir sala");
  }
  return (await res.json()) as { ok: true; deletedRoomId: number; floor: number };
}

