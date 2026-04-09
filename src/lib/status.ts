import type { RoomStatus } from "./buildingTypes";

export const STATUS_ORDER: RoomStatus[] = ["disponivel", "ocupada", "reservada", "manutencao"];

export const STATUS_META: Record<
  RoomStatus,
  {
    label: string;
    emoji: string;
    color: number; // hex
    glow: number; // intensity multiplier
  }
> = {
  disponivel: { label: "Disponível", emoji: "🟢", color: 0x22c55e, glow: 1.2 },
  ocupada: { label: "Ocupada", emoji: "🔴", color: 0xef4444, glow: 1.3 },
  reservada: { label: "Reservada", emoji: "🟣", color: 0xc026d3, glow: 1.15 },
  manutencao: { label: "Manutenção", emoji: "🟡", color: 0xf59e0b, glow: 1.25 },
};

export function formatStatus(status: RoomStatus) {
  const meta = STATUS_META[status];
  return `${meta.emoji} ${meta.label}`;
}

