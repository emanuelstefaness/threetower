import type { BuildingSnapshot, RoomRecord } from "@/lib/buildingTypes";

/**
 * Histórico de preço (faixa / valor m² / valor do imóvel): só o gestor pode ver.
 * Estas funções devolvem CÓPIAS sem o histórico — nunca mutam o estado em memória do servidor.
 */
export function stripPriceHistoryFromRoom<T extends RoomRecord>(room: T): T {
  if (!room.meta?.faixaPrecoHistorico) return room;
  const { faixaPrecoHistorico: _removed, ...meta } = room.meta;
  void _removed;
  return { ...room, meta };
}

export function stripPriceHistoryFromSnapshot(snapshot: BuildingSnapshot): BuildingSnapshot {
  const roomsById: Record<number, RoomRecord> = {};
  for (const [idStr, room] of Object.entries(snapshot.roomsById)) {
    roomsById[Number(idStr)] = stripPriceHistoryFromRoom(room);
  }
  return { ...snapshot, roomsById };
}
