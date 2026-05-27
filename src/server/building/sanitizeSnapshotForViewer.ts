import type { BuildingSnapshot, RoomRecord } from "@/lib/buildingTypes";
import { roomShowsListPriceInViewMode } from "@/lib/viewModeRoomDisplay";

/** Campos de negócio/fechamento que o visitante não deve receber. */
const SENSITIVE_META_KEYS = [
  "precificacao",
  "faixa",
  "faixaPrecoHistorico",
  "valorM2",
  "baseCalculoVenda",
  "formaPagamento",
  "prazoPagamento",
  "valorVenda",
  "descontos",
  "dataVenda",
  "corretor",
  "imobiliaria",
  "comprador",
  "reservedAt",
  "reservedByName",
  "reservedByLogin",
] as const;

function sanitizeRoomMeta(room: RoomRecord): RoomRecord["meta"] {
  const meta = room.meta ? { ...room.meta } : undefined;
  if (!meta) return undefined;

  for (const k of SENSITIVE_META_KEYS) {
    delete (meta as Record<string, unknown>)[k];
  }

  const status = room.statusSala ?? meta.statusSalaOriginal;
  if (!roomShowsListPriceInViewMode(status)) {
    delete (meta as Record<string, unknown>).valorImovel;
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}

/** Remove dados de comprador, corretagem, fechamento e valores fora de estoque. */
export function sanitizeSnapshotForViewer(snapshot: BuildingSnapshot): BuildingSnapshot {
  const roomsById: Record<number, RoomRecord> = {};
  for (const [idStr, room] of Object.entries(snapshot.roomsById)) {
    const id = Number(idStr);
    roomsById[id] = {
      ...room,
      meta: sanitizeRoomMeta(room),
      statusSalaHistory: undefined,
      history: [],
    };
  }
  return {
    ...snapshot,
    roomsById,
    notifications: [],
  };
}
