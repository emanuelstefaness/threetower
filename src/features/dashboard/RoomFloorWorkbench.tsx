"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBuildingState, updateRoomDetails } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import FloorPlanHotspots from "@/features/floorplan/FloorPlanHotspots";
import type { RoomRecord } from "@/lib/buildingTypes";
import { TREE_TOWER_STATUS_SALA_OPTIONS } from "@/lib/treeTowerStatusSala";

function formatMoneyBRL(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusSelectOptions(current: string): string[] {
  const cur = current.trim();
  const base = [...TREE_TOWER_STATUS_SALA_OPTIONS];
  if (cur && !base.includes(cur)) base.unshift(cur);
  return base;
}

export type RoomFloorWorkbenchProps = {
  floor: number;
  /** Lista de cartões abaixo da planta */
  showRoomGrid?: boolean;
  subCaption?: string;
  openRoomIdRequest?: number | null;
  onOpenRoomRequestHandled?: () => void;
  className?: string;
  nestedInFloorModal?: boolean;
};

export default function RoomFloorWorkbench({
  floor,
  showRoomGrid = true,
  subCaption,
  openRoomIdRequest,
  onOpenRoomRequestHandled,
  className,
  nestedInFloorModal = false,
}: RoomFloorWorkbenchProps) {
  const { building, appMode, setBuilding } = useBuildingStoreClient();
  const readOnly = appMode === "view";
  const skipNextPlanClear = useRef(false);

  const [editRoomId, setEditRoomId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatusSala, setEditStatusSala] = useState("");

  const [selectedPlanSlot, setSelectedPlanSlot] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; icon: string } | null>(null);
  const showToast = (msg: string, icon = "✅") => {
    setToast({ msg, icon });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 3000);
  };

  const floorRooms = useMemo(() => {
    if (!building) return [];
    const ids = building.floors[floor] ?? [];
    return ids.map((id) => building.roomsById[id]).filter(Boolean).sort((a, b) => a.id - b.id);
  }, [building, floor]);

  const openEdit = useCallback((room: RoomRecord) => {
    setEditRoomId(room.id);
    setEditName(room.name ?? "");
    setEditStatusSala(room.statusSala ?? room.meta?.statusSalaOriginal ?? "");
  }, []);

  const closeEdit = () => setEditRoomId(null);

  useEffect(() => {
    if (skipNextPlanClear.current) {
      skipNextPlanClear.current = false;
      return;
    }
    setSelectedPlanSlot(null);
  }, [floor]);

  useEffect(() => {
    if (openRoomIdRequest == null || !building) return;
    const room = building.roomsById[openRoomIdRequest];
    if (!room || room.floor !== floor) return;
    skipNextPlanClear.current = true;
    setSelectedPlanSlot(room.planSlot ?? null);
    openEdit(room);
    onOpenRoomRequestHandled?.();
  }, [openRoomIdRequest, building, floor, openEdit, onOpenRoomRequestHandled]);

  const saveEdit = async () => {
    if (readOnly) return;
    if (editRoomId == null) return;
    try {
      const current = building?.roomsById[editRoomId];
      if (!current) throw new Error("Sala não encontrada");
      const next = editStatusSala.trim();
      if (!next) throw new Error("Selecione o status da sala.");
      const nextName = editName.trim();
      if (!nextName) throw new Error("Informe o nome da sala.");

      await updateRoomDetails(editRoomId, { name: nextName, statusSala: next, by: "admin" });

      const { snapshot, appMode: mode, authEnabled } = await fetchBuildingState();
      setBuilding(snapshot, mode, authEnabled);
      showToast("Status da sala atualizado", "✅");
      closeEdit();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Falha ao salvar", "⚠️");
    }
  };

  const wrapClass = className ? ` ${className}` : "";

  const editingRoom = editRoomId != null && building ? building.roomsById[editRoomId] : null;

  return (
    <>
      <div className={`manager-wrap${wrapClass}`}>
        <FloorPlanHotspots
          floor={floor}
          rooms={floorRooms}
          selectedSlotId={selectedPlanSlot}
          onSelectRoom={(room) => {
            setSelectedPlanSlot(room.planSlot ?? null);
            openEdit(room);
          }}
          onSelectEmptySlot={() => showToast("Não há sala cadastrada neste vão.", "ℹ️")}
          subCaption={
            subCaption !== undefined ? subCaption : readOnly ? "Visualização — clique numa sala para ver os dados." : undefined
          }
        />
      </div>

      {showRoomGrid && (
        <div className={`manager-wrap${wrapClass}`}>
          <div className="manager-title">Salas do Andar {floor}</div>
          <div className="manager-grid">
            <div className="sb-count" style={{ padding: 0, marginBottom: 10 }}>
              {floorRooms.length} sala{floorRooms.length !== 1 ? "s" : ""}
            </div>
            <div className="rooms-grid">
              {floorRooms.map((r) => {
                const ss = r.statusSala ?? r.meta?.statusSalaOriginal ?? "—";
                return (
                  <div
                    key={r.id}
                    className={`room-card rc-d${readOnly ? " room-card--readonly" : ""}`}
                    onClick={() => openEdit(r)}
                  >
                    <div className="rc-area">{r.area}m²</div>
                    <div className="rc-num">{r.id}</div>
                    <div className="rc-name">{r.name}</div>
                    <div className="rc-status">
                      <div className="rc-dot" />
                      {ss}
                    </div>
                    <div className="rc-status" style={{ marginTop: 4, opacity: 0.85 }}>
                      {formatMoneyBRL(r.meta?.valorImovel)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div
        className={`edit-overlay${nestedInFloorModal ? " edit-overlay--nested" : ""} ${editRoomId != null ? "open" : ""}`}
        onClick={(e) => e.target === e.currentTarget && closeEdit()}
      >
        <div className="edit-modal" style={{ maxWidth: 520 }}>
          <div className="em-title">{editingRoom?.name ?? "—"}</div>
          <div className="em-sub">
            {editingRoom ? `Andar ${editingRoom.floor} · Unidade #${editingRoom.id}` : "—"}
          </div>

          {editingRoom ? (
            <>
              {readOnly ? (
                <div className="em-section">
                  <div className="em-readonly-banner">Modo visualização — dados não podem ser alterados.</div>
                </div>
              ) : null}
              <div className="em-section">
                <div className="em-section-title">{readOnly ? "Dados" : "Edição rápida"}</div>
                <div className="em-grid em-grid-2">
                  <div className="em-field" style={{ marginBottom: 0 }}>
                    <label className="em-label" htmlFor="room-name-input">
                      Nome da sala
                    </label>
                    <input
                      id="room-name-input"
                      className="em-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Ex.: Sala Comercial 101"
                      disabled={readOnly}
                    />
                  </div>

                  <div className="em-field" style={{ marginBottom: 0 }}>
                    <label className="em-label" htmlFor="status-sala-select">
                      Status da sala (planilha)
                    </label>
                    <select
                      id="status-sala-select"
                      className="em-select"
                      value={editStatusSala}
                      onChange={(e) => setEditStatusSala(e.target.value)}
                      disabled={readOnly}
                    >
                      {statusSelectOptions(editStatusSala).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="em-section">
                <div className="em-section-title">Dados principais</div>
                <div className="em-grid em-grid-2">
                  <div className="em-field">
                    <div className="em-label">Posição (fixa)</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.posicao?.trim() || "—"}</div>
                  </div>
                  <div className="em-field">
                    <div className="em-label">Matrícula</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.matricula?.trim() || "—"}</div>
                  </div>
                  <div className="em-field">
                    <div className="em-label">Valor do imóvel</div>
                    <div className="em-input em-readonly">{formatMoneyBRL(editingRoom.meta?.valorImovel) || "—"}</div>
                  </div>
                  <div className="em-field">
                    <div className="em-label">Valor m²</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.valorM2 ?? "—"}</div>
                  </div>
                </div>
              </div>

              <div className="em-section">
                <div className="em-section-title">Áreas (m²)</div>
                <div className="em-grid em-grid-3">
                  <div className="em-field">
                    <div className="em-label">Coberta</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.areaCobertaM2 ?? "—"}</div>
                  </div>
                  <div className="em-field">
                    <div className="em-label">Descoberta</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.areaDescobertaM2 ?? "—"}</div>
                  </div>
                  <div className="em-field">
                    <div className="em-label">Privativa</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.areaPrivativaM2 ?? editingRoom.area}</div>
                  </div>
                </div>
              </div>

              <div className="em-section">
                <div className="em-section-title">Precificação / venda</div>
                <div className="em-grid em-grid-2">
                  <div className="em-field">
                    <div className="em-label">Precificação</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.precificacao ?? "—"}</div>
                  </div>
                  <div className="em-field">
                    <div className="em-label">Faixa</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.faixa ?? "—"}</div>
                  </div>
                  <div className="em-field">
                    <div className="em-label">Base cálculo</div>
                    <div className="em-input em-readonly">{editingRoom.meta?.baseCalculoVenda ?? "—"}</div>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="em-btns">
            <button className="em-btn em-cancel" type="button" onClick={closeEdit}>
              {readOnly ? "Fechar" : "Cancelar"}
            </button>
            {readOnly ? null : (
              <button className="em-btn em-save" type="button" onClick={saveEdit}>
                Salvar
              </button>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast show" role="status" aria-live="polite">
          <span className="toast-ico">{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </>
  );
}
