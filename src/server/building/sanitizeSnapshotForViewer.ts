import type { BuildingSnapshot, RoomRecord } from "@/lib/buildingTypes";

/** Visitante não recebe: relatório (precificação/faixa/base, m²), fechamento e forma de pagamento. Valor do imóvel e comprador permanecem. */
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
] as const;

/** Remove campos de relatório e de pagamento/fechamento — visitante não recebe no JSON. */
export function sanitizeSnapshotForViewer(snapshot: BuildingSnapshot): BuildingSnapshot {
  const roomsById: Record<number, RoomRecord> = {};
  for (const [idStr, room] of Object.entries(snapshot.roomsById)) {
    const id = Number(idStr);
    const meta = room.meta ? { ...room.meta } : undefined;
    if (meta) {
      for (const k of SENSITIVE_META_KEYS) {
        delete (meta as Record<string, unknown>)[k];
      }
      delete (meta as Record<string, unknown>).reservedByLogin;
    }
    roomsById[id] = {
      ...room,
      meta,
    };
  }
  return {
    ...snapshot,
    roomsById,
  };
}
