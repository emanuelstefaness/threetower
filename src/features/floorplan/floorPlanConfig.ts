import { salaLabelForFloorSlot } from "./planSlotLabels";

export type FloorPlanSlot = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type SlotCoords = Omit<FloorPlanSlot, "label">;

/**
 * Geometria dos vãos (F-01…F-22). O rótulo exibido é sempre “Sala {andar}{01–22}”
 * (ex.: andar 1 + F-01 → Sala 101), alinhado à numeração da planilha.
 */
const TEMPLATE_COORDS: SlotCoords[] = [
  { id: "F-01", x: 63.8, y: 5.5, w: 5.3, h: 40.3 },
  { id: "F-02", x: 63.8, y: 53.6, w: 5.6, h: 40.7 },
  { id: "F-03", x: 69.7, y: 6.8, w: 5.2, h: 39.0 },
  { id: "F-04", x: 70.0, y: 54.9, w: 5.1, h: 39.4 },
  { id: "F-05", x: 75.3, y: 6.8, w: 5.9, h: 39.0 },
  { id: "F-06", x: 75.5, y: 54.9, w: 5.8, h: 39.4 },
  { id: "F-07", x: 81.8, y: 6.8, w: 5.2, h: 39.0 },
  { id: "F-08", x: 81.9, y: 54.9, w: 5.1, h: 39.4 },
  { id: "F-09", x: 87.5, y: 6.8, w: 11.7, h: 41.6 },
  { id: "F-10", x: 87.5, y: 52.3, w: 11.7, h: 42.9 },
  { id: "F-11", x: 43.8, y: 5.5, w: 6.3, h: 40.3 },
  { id: "F-12", x: 43.5, y: 53.6, w: 6.6, h: 40.7 },
  { id: "F-13", x: 37.9, y: 6.8, w: 5.9, h: 39.0 },
  { id: "F-14", x: 37.5, y: 54.9, w: 6.0, h: 39.4 },
  { id: "F-15", x: 32.0, y: 6.8, w: 5.9, h: 39.0 },
  { id: "F-16", x: 31.5, y: 54.9, w: 6.0, h: 39.4 },
  { id: "F-17", x: 26.1, y: 6.8, w: 5.9, h: 39.0 },
  { id: "F-18", x: 25.5, y: 54.9, w: 6.0, h: 39.4 },
  { id: "F-19", x: 19.9, y: 6.8, w: 6.2, h: 39.0 },
  { id: "F-20", x: 19.9, y: 54.9, w: 5.6, h: 39.4 },
  { id: "F-21", x: 0.8, y: 5.5, w: 19.1, h: 44.2 },
  { id: "F-22", x: 0.8, y: 53.6, w: 19.1, h: 43.1 },
];

export function getFloorPlanImage(floor: number): string {
  void floor;
  return `/floorplans/andar-template.png`;
}

export function getFloorPlanSlots(floor: number): FloorPlanSlot[] {
  return TEMPLATE_COORDS.map((s) => ({
    ...s,
    label: salaLabelForFloorSlot(floor, s.id),
  }));
}
