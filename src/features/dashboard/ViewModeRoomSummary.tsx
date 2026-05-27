"use client";

import type { RoomRecord } from "@/lib/buildingTypes";
import { formatMoneyBRL } from "@/lib/formatMoney";
import { roomShowsListPriceInViewMode, roomStatusSalaLabel } from "@/lib/viewModeRoomDisplay";

function formatAreaM2(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

type Props = {
  room: RoomRecord;
};

/** Resumo permitido no modo visualização: status, m² e valor (só em estoque). */
export function ViewModeRoomSummary({ room }: Props) {
  const statusLabel = roomStatusSalaLabel(room);
  const showPrice = roomShowsListPriceInViewMode(statusLabel);

  return (
    <>
      <div className="em-section">
        <div className="em-readonly-banner">Modo visualização — dados limitados (sem comprador, corretor ou fechamento).</div>
      </div>
      <div className="em-section">
        <div className="em-section-title">Status da sala</div>
        <div className="em-input em-readonly">{statusLabel}</div>
      </div>
      <div className="em-section">
        <div className="em-section-title">Área (m²)</div>
        <div className="em-grid em-grid-3">
          <div className="em-field">
            <div className="em-label">Privativa</div>
            <div className="em-input em-readonly">{formatAreaM2(room.meta?.areaPrivativaM2 ?? room.area)}</div>
          </div>
          <div className="em-field">
            <div className="em-label">Coberta</div>
            <div className="em-input em-readonly">
              {room.meta?.areaCobertaM2 != null ? formatAreaM2(room.meta.areaCobertaM2) : "—"}
            </div>
          </div>
          <div className="em-field">
            <div className="em-label">Descoberta</div>
            <div className="em-input em-readonly">
              {room.meta?.areaDescobertaM2 != null ? formatAreaM2(room.meta.areaDescobertaM2) : "—"}
            </div>
          </div>
        </div>
      </div>
      {showPrice ? (
        <div className="em-section">
          <div className="em-section-title">Valor (disponível)</div>
          <div className="em-input em-readonly em-input--value-spotlight">{formatMoneyBRL(room.meta?.valorImovel)}</div>
        </div>
      ) : null}
    </>
  );
}
