"use client";

import Image from "next/image";
import type { RoomRecord } from "@/lib/buildingTypes";
import { getFloorPlanImage, getFloorPlanSlots } from "./floorPlanConfig";
import { tryFormatMoneyBRL } from "@/lib/formatMoney";
import { planToneForStatusSala } from "@/lib/treeTowerStatusSala";

type Props = {
  floor: number;
  rooms: RoomRecord[];
  selectedSlotId: string | null;
  onSelectRoom: (room: RoomRecord) => void;
  /** Quando não há sala no vão (inventário fixo): aviso, sem fluxo de criação */
  onSelectEmptySlot?: (slot: { id: string; label: string }) => void;
  /** Subtítulo abaixo do título. Omitir = texto padrão; string vazia = sem subtítulo */
  subCaption?: string;
};

export default function FloorPlanHotspots({
  floor,
  rooms,
  selectedSlotId,
  onSelectRoom,
  onSelectEmptySlot,
  subCaption,
}: Props) {
  const slots = getFloorPlanSlots(floor);
  const imageSrc = getFloorPlanImage(floor);

  const roomsBySlot = new Map<string, RoomRecord>();
  for (const room of rooms) {
    if (room.planSlot) roomsBySlot.set(room.planSlot, room);
  }

  const subLine =
    subCaption === undefined ? "Clique em uma sala na planta para ver os dados da planilha." : subCaption;

  return (
    <div className="floorplan-wrap">
      <div className="floorplan-head">
        <div className="manager-title">Planta do Andar {floor}</div>
        {subLine ? <div className="manager-sub">{subLine}</div> : null}
      </div>

      <div className="floorplan-stage">
        <Image
          src={imageSrc}
          alt={`Planta do andar ${floor}`}
          className="floorplan-image"
          width={1680}
          height={807}
          priority
        />

        {slots.map((slot) => {
          const room = roomsBySlot.get(slot.id);
          const tone = room
            ? planToneForStatusSala(room.statusSala ?? room.meta?.statusSalaOriginal)
            : "d";
          const statusClass = `plan-${tone}`;
          const isSelected = selectedSlotId === slot.id;

          const valor = room?.meta?.valorImovel;
          const valorTxt = tryFormatMoneyBRL(valor) ?? "";

          const title = room
            ? `${room.name} · ${room.statusSala ?? room.meta?.statusSalaOriginal ?? "—"}${valorTxt ? ` · ${valorTxt}` : ""}`
            : `${slot.label} · sem sala cadastrada`;

          return (
            <button
              key={slot.id}
              type="button"
              className={`plan-slot ${statusClass} ${isSelected ? "selected" : ""} ${room ? "has-room" : ""}`}
              style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.w}%`, height: `${slot.h}%` }}
              onClick={() =>
                room ? onSelectRoom(room) : onSelectEmptySlot?.({ id: slot.id, label: slot.label })
              }
              title={title}
              aria-label={title}
            >
              <span className="plan-slot-labels">
                {room ? (
                  <>
                    <span className="plan-slot-occ">{room.name}</span>
                    <span className="plan-slot-num">{room.id}</span>
                    {valorTxt ? <span className="plan-slot-vago">{valorTxt}</span> : null}
                  </>
                ) : (
                  <span className="plan-slot-vago">—</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
