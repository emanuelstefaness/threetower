import type { RoomStatus } from "@/lib/buildingTypes";

export const STATUS_CODE_ORDER = ["d", "i", "v", "a"] as const;
export type StatusCode = (typeof STATUS_CODE_ORDER)[number];

export const STATUS_TO_CODE: Record<RoomStatus, StatusCode> = {
  disponivel: "d",
  ocupada: "i",
  reservada: "v",
  manutencao: "a",
};

export const CODE_TO_STATUS: Record<StatusCode, RoomStatus> = {
  d: "disponivel",
  i: "ocupada",
  v: "reservada",
  a: "manutencao",
};

export const CODE_META: Record<StatusCode, { label: string; emoji: string }> = {
  d: { label: "Disponível", emoji: "🟢" },
  i: { label: "Indisponível", emoji: "🔴" },
  v: { label: "Reservada", emoji: "🟣" },
  a: { label: "Alugada", emoji: "🟡" },
};

export function clampRoomArea(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
