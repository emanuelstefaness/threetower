import { salaLabelForFloorSlot } from "@/features/floorplan/planSlotLabels";
import { normalizeStatusSala, planToneForStatusSala } from "@/lib/treeTowerStatusSala";

/** Em modo visualização, só salas em estoque exibem valor de tabela. */
export function roomShowsListPriceInViewMode(statusSala: string | undefined): boolean {
  return normalizeStatusSala(statusSala) === "ESTOQUE";
}

export function roomStatusSalaLabel(room: { statusSala?: string; meta?: { statusSalaOriginal?: string } }): string {
  return (room.statusSala ?? room.meta?.statusSalaOriginal ?? "—").trim() || "—";
}

/** Rótulo público da sala (sem nome de comprador/locatário). Ex.: Sala 1101 */
export function roomPublicLabel(room: { id: number; floor: number; planSlot?: string }): string {
  if (room.planSlot) {
    const fromSlot = salaLabelForFloorSlot(room.floor, room.planSlot);
    if (!fromSlot.startsWith("F-")) return fromSlot;
  }
  return `Sala ${room.id}`;
}

/** Classe CSS do cartão conforme STATUS SALA (rc-d, rc-i, rc-v, rc-a). */
export function roomCardToneClass(statusSala: string | undefined): string {
  return `rc-${planToneForStatusSala(statusSala)}`;
}
