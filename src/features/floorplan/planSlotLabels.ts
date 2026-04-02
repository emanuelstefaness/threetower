/** Converte F-01 … F-22 no sufixo da unidade (01…22) para o rótulo “Sala {andar}{sufixo}” (ex.: andar 1 + F-01 → Sala 101). */
export function unitSuffixFromPlanSlotId(slotId: string): number {
  const m = slotId.match(/^F-(\d{1,2})$/i);
  if (!m) return 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}

export function salaLabelForFloorSlot(floor: number, slotId: string): string {
  const n = unitSuffixFromPlanSlotId(slotId);
  if (!Number.isFinite(floor) || floor < 1 || n <= 0) return slotId;
  return `Sala ${floor}${String(n).padStart(2, "0")}`;
}
