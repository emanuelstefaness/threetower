import { normalizeStatusSala } from "@/lib/treeTowerStatusSala";

/** Em modo visualização, só salas em estoque exibem valor de tabela. */
export function roomShowsListPriceInViewMode(statusSala: string | undefined): boolean {
  return normalizeStatusSala(statusSala) === "ESTOQUE";
}

export function roomStatusSalaLabel(room: { statusSala?: string; meta?: { statusSalaOriginal?: string } }): string {
  return (room.statusSala ?? room.meta?.statusSalaOriginal ?? "—").trim() || "—";
}
