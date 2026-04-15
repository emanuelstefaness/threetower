"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBuildingState, updateRoomDetails } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import FloorPlanHotspots from "@/features/floorplan/FloorPlanHotspots";
import type { RoomRecord } from "@/lib/buildingTypes";
import { formatDecimalBRL, formatMoneyBRL } from "@/lib/formatMoney";
import { displayReservedByName, displayReservedForName } from "@/lib/reservedDisplay";
import {
  canonicalStatusSalaForSelect,
  looksLikeRentedStatusSala,
  looksLikeSoldStatusSala,
  statusSalaRequiresFechamentoCompleto,
  statusSalaShowsDataVendaField,
  TREE_TOWER_STATUS_SALA_OPTIONS,
} from "@/lib/treeTowerStatusSala";
import { formatSaleDateIsoLocal } from "@/lib/vendasMensaisAgg";

/** Aceita vazio (limpa), ponto ou vírgula decimal; remove separadores de milhar comuns. */
function formatDateInputFromMs(ms: number | undefined): string {
  return formatSaleDateIsoLocal(ms);
}

function parseDateInputLocal(s: string): number {
  const t = s.trim();
  if (!t) throw new Error("Indique a data (AAAA-MM-DD) ou deixe em branco.");
  const [y, mo, da] = t.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) {
    throw new Error("Data: use o formato AAAA-MM-DD.");
  }
  const ms = new Date(y, mo - 1, da, 12, 0, 0, 0).getTime();
  if (Number.isNaN(ms)) throw new Error("Data inválida.");
  return ms;
}

function parseOptionalMoney(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return null;
  let n = t;
  if (n.includes(",") && n.includes(".")) n = n.replace(/\./g, "").replace(",", ".");
  else if (n.includes(",")) n = n.replace(",", ".");
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error("Valores numéricos: use apenas dígitos (ex.: 1500000 ou 1500000,50).");
  return v;
}

function statusSelectOptions(current: string): string[] {
  const cur = current.trim();
  const base = [...TREE_TOWER_STATUS_SALA_OPTIONS];
  if (cur && !base.includes(cur)) base.unshift(cur);
  return base;
}

function parseOptionalSaleDate(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  return parseDateInputLocal(t);
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
  const { building, appMode, authRole, authName, setBuilding } = useBuildingStoreClient();
  const readOnly = appMode === "view";
  const isViewer = authRole === "viewer";
  /** Visitante não vê blocos de relatório nem pagamento; valor do imóvel e comprador sim (API alinhada). */
  const hideReportAndPaymentUi = isViewer;
  const skipNextPlanClear = useRef(false);

  const [editRoomId, setEditRoomId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatusSala, setEditStatusSala] = useState("");
  const [editValorImovel, setEditValorImovel] = useState("");
  const [editValorM2, setEditValorM2] = useState("");
  const [editPrecificacao, setEditPrecificacao] = useState("");
  const [editFaixa, setEditFaixa] = useState("");
  const [editBaseCalculo, setEditBaseCalculo] = useState("");
  const [editCorretor, setEditCorretor] = useState("");
  const [editImobiliaria, setEditImobiliaria] = useState("");
  const [editComprador, setEditComprador] = useState("");
  const [editFormaPagamento, setEditFormaPagamento] = useState("");
  const [editPrazoPagamento, setEditPrazoPagamento] = useState("");
  const [editDataVenda, setEditDataVenda] = useState("");

  const [selectedPlanSlot, setSelectedPlanSlot] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; icon: string } | null>(null);
  const [savingCardSaleDateId, setSavingCardSaleDateId] = useState<number | null>(null);
  const showToast = useCallback((msg: string, icon = "✅") => {
    setToast({ msg, icon });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 3000);
  }, []);

  const saveCardSaleDate = useCallback(
    async (room: RoomRecord, dateStr: string) => {
      if (readOnly) return;
      const st = room.statusSala ?? room.meta?.statusSalaOriginal;
      if (!statusSalaShowsDataVendaField(st)) return;
      const prevStr = formatSaleDateIsoLocal(room.meta?.dataVenda);
      const nextStr = dateStr.trim();
      if (prevStr === nextStr) return;
      let dataVenda: number | null;
      try {
        dataVenda = parseOptionalSaleDate(dateStr);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Data inválida", "⚠️");
        return;
      }
      setSavingCardSaleDateId(room.id);
      try {
        await updateRoomDetails(room.id, {
          by: authName?.trim() || "admin",
          dataVenda,
        });
        const { snapshot, appMode: mode, authEnabled, authRole: r, authName: an, authLogin: al } =
          await fetchBuildingState();
        setBuilding(snapshot, mode, authEnabled, r, an, al);
        showToast(dataVenda != null ? "Data da venda guardada" : "Data da venda removida", "✅");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Falha ao guardar data", "⚠️");
      } finally {
        setSavingCardSaleDateId(null);
      }
    },
    [authName, readOnly, setBuilding, showToast],
  );

  const floorRooms = useMemo(() => {
    if (!building) return [];
    const ids = building.floors[floor] ?? [];
    return ids.map((id) => building.roomsById[id]).filter(Boolean).sort((a, b) => a.id - b.id);
  }, [building, floor]);

  const openEdit = useCallback((room: RoomRecord) => {
    setEditRoomId(room.id);
    setEditName(room.name ?? "");
    setEditStatusSala(canonicalStatusSalaForSelect(room.statusSala ?? room.meta?.statusSalaOriginal ?? ""));
    const m = room.meta;
    setEditValorImovel(m?.valorImovel != null && Number.isFinite(m.valorImovel) ? String(m.valorImovel) : "");
    setEditValorM2(m?.valorM2 != null && Number.isFinite(m.valorM2) ? String(m.valorM2) : "");
    setEditPrecificacao(m?.precificacao ?? "");
    setEditFaixa(m?.faixa ?? "");
    setEditBaseCalculo(m?.baseCalculoVenda != null && Number.isFinite(m.baseCalculoVenda) ? String(m.baseCalculoVenda) : "");
    setEditCorretor(m?.corretor ?? "");
    setEditImobiliaria(m?.imobiliaria ?? "");
    setEditComprador(m?.comprador ?? "");
    setEditFormaPagamento(m?.formaPagamento ?? "");
    setEditPrazoPagamento(m?.prazoPagamento ?? "");
    setEditDataVenda(formatDateInputFromMs(m?.dataVenda));
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

      if (statusSalaRequiresFechamentoCompleto(next)) {
        if (!editCorretor.trim()) {
          showToast("Para VENDIDO ou ALUGADA, indique o corretor.", "⚠️");
          return;
        }
        if (!editImobiliaria.trim()) {
          showToast("Para VENDIDO ou ALUGADA, indique a imobiliária.", "⚠️");
          return;
        }
        if (!editComprador.trim()) {
          showToast("Para VENDIDO ou ALUGADA, indique o comprador ou locatário.", "⚠️");
          return;
        }
        if (!editDataVenda.trim()) {
          showToast("Para VENDIDO ou ALUGADA, indique a data (venda ou início do aluguel).", "⚠️");
          return;
        }
      }

      let valorImovel: number | null;
      let valorM2: number | null;
      let baseCalculoVenda: number | null;
      let dataVenda: number | null;
      try {
        valorImovel = parseOptionalMoney(editValorImovel);
        valorM2 = parseOptionalMoney(editValorM2);
        baseCalculoVenda = parseOptionalMoney(editBaseCalculo);
        if (statusSalaShowsDataVendaField(next)) {
          dataVenda = editDataVenda.trim() ? parseDateInputLocal(editDataVenda) : null;
        } else {
          dataVenda = null;
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Valor inválido", "⚠️");
        return;
      }

      if (statusSalaRequiresFechamentoCompleto(next) && (dataVenda == null || !Number.isFinite(dataVenda))) {
        showToast("Para VENDIDO ou ALUGADA, use uma data válida.", "⚠️");
        return;
      }

      await updateRoomDetails(editRoomId, {
        name: nextName,
        statusSala: next,
        by: authName?.trim() || "admin",
        valorImovel,
        valorM2,
        baseCalculoVenda,
        precificacao: editPrecificacao.trim() || null,
        faixa: editFaixa.trim() || null,
        corretor: editCorretor.trim() || null,
        imobiliaria: editImobiliaria.trim() || null,
        comprador: editComprador.trim() || null,
        formaPagamento: editFormaPagamento.trim() || null,
        prazoPagamento: editPrazoPagamento.trim() || null,
        dataVenda,
      });

      const { snapshot, appMode: mode, authEnabled, authRole: r, authName: an, authLogin: al } =
        await fetchBuildingState();
      setBuilding(snapshot, mode, authEnabled, r, an, al);
      showToast("Dados da sala atualizados", "✅");
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
                const showCardDate = statusSalaShowsDataVendaField(ss);
                const cardDateLabel =
                  looksLikeSoldStatusSala(ss) && !looksLikeRentedStatusSala(ss)
                    ? "Data venda"
                    : looksLikeRentedStatusSala(ss) && !looksLikeSoldStatusSala(ss)
                      ? "Data aluguel"
                      : "Data";
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
                    {showCardDate ? (
                      <div
                        className="rc-date-row"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="rc-date-label">{cardDateLabel}</div>
                        {readOnly ? (
                          <div className="rc-date-value">
                            {(() => {
                              const ms = r.meta?.dataVenda;
                              if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
                              return new Date(ms).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              });
                            })()}
                          </div>
                        ) : (
                          <input
                            type="date"
                            className="rc-input-date"
                            disabled={savingCardSaleDateId === r.id}
                            title="Editável quando o status é venda ou aluguel"
                            key={`dv-card-${r.id}-${formatSaleDateIsoLocal(r.meta?.dataVenda)}`}
                            defaultValue={formatSaleDateIsoLocal(r.meta?.dataVenda)}
                            onBlur={(e) => void saveCardSaleDate(r, e.currentTarget.value)}
                          />
                        )}
                      </div>
                    ) : null}
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
                      Status da sala
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

              {(() => {
                const statusForDateUi = readOnly
                  ? (editingRoom.statusSala ?? editingRoom.meta?.statusSalaOriginal ?? "")
                  : editStatusSala;
                if (!statusSalaShowsDataVendaField(statusForDateUi)) return null;
                const sold = looksLikeSoldStatusSala(statusForDateUi);
                const rented = looksLikeRentedStatusSala(statusForDateUi);
                const dataLabel =
                  sold && !rented ? "Data da venda" : rented && !sold ? "Data do aluguel" : "Data";
                return (
                  <div className="em-section">
                    <div className="em-section-title">Data · relatório</div>
                    <div className="em-field" style={{ marginBottom: 0 }}>
                      <label className="em-label" htmlFor="room-data-venda-main">
                        {dataLabel}
                      </label>
                      {readOnly ? (
                        <div id="room-data-venda-main" className="em-input em-readonly">
                          {formatDateInputFromMs(editingRoom.meta?.dataVenda) || "—"}
                        </div>
                      ) : (
                        <>
                          <input
                            id="room-data-venda-main"
                            className="em-input"
                            type="date"
                            value={editDataVenda}
                            onChange={(e) => setEditDataVenda(e.target.value)}
                            autoComplete="off"
                          />
                          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85, lineHeight: 1.4 }}>
                            {sold ? (
                              <>
                                Usada no relatório <strong>Vendas por período</strong> (mês da venda).
                              </>
                            ) : (
                              <>Registo da data de <strong>posse ou contrato</strong> de aluguel.</>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {editingRoom?.status === "reservada" && (editingRoom.meta?.reservedByName || editingRoom.meta?.reservedAt) ? (
                <div className="em-section">
                  <div className="em-section-title">Reserva</div>
                  <div className="em-readonly-banner" style={{ marginBottom: 8 }}>
                    Reservado por: <strong>{displayReservedByName(editingRoom.meta)}</strong>
                    {(() => {
                      const login = editingRoom.meta?.reservedByLogin?.trim();
                      const shown = displayReservedByName(editingRoom.meta);
                      if (!login || shown.toLowerCase() === login.toLowerCase()) return null;
                      return <span style={{ opacity: 0.75 }}> ({login})</span>;
                    })()}
                  </div>
                  <div className="em-readonly-banner" style={{ marginBottom: 8 }}>
                    Reservado para (comprador): <strong>{displayReservedForName(editingRoom.meta)}</strong>
                  </div>
                </div>
              ) : null}

              <div className="em-section">
                <div className="em-section-title">
                  {looksLikeSoldStatusSala(editStatusSala)
                    ? "Venda — corretagem e comprador"
                    : looksLikeRentedStatusSala(editStatusSala)
                      ? "Aluguel — corretagem e locatário (obrigatório em ALUGADA, como na venda)"
                      : "Corretagem e comprador (preencher ao vender ou alugar)"}
                </div>
                <div className="em-grid em-grid-2">
                  <div className="em-field">
                    <label className="em-label" htmlFor="room-corretor">
                      Corretor
                    </label>
                    {readOnly ? (
                      <div className="em-input em-readonly">{editingRoom.meta?.corretor?.trim() || "—"}</div>
                    ) : (
                      <input
                        id="room-corretor"
                        className="em-input"
                        value={editCorretor}
                        onChange={(e) => setEditCorretor(e.target.value)}
                        placeholder="Nome do corretor"
                        autoComplete="off"
                      />
                    )}
                  </div>
                  <div className="em-field">
                    <label className="em-label" htmlFor="room-imobiliaria">
                      Imobiliária
                    </label>
                    {readOnly ? (
                      <div className="em-input em-readonly">{editingRoom.meta?.imobiliaria?.trim() || "—"}</div>
                    ) : (
                      <input
                        id="room-imobiliaria"
                        className="em-input"
                        value={editImobiliaria}
                        onChange={(e) => setEditImobiliaria(e.target.value)}
                        placeholder="Nome da imobiliária"
                        autoComplete="off"
                      />
                    )}
                  </div>
                  <div className="em-field" style={{ gridColumn: "1 / -1" }}>
                    <label className="em-label" htmlFor="room-comprador">
                      {looksLikeSoldStatusSala(editStatusSala)
                        ? "Comprador"
                        : looksLikeRentedStatusSala(editStatusSala)
                          ? "Locatário"
                          : "Comprador"}
                    </label>
                    {readOnly ? (
                      <div className="em-input em-readonly">{editingRoom.meta?.comprador?.trim() || "—"}</div>
                    ) : (
                      <input
                        id="room-comprador"
                        className="em-input"
                        value={editComprador}
                        onChange={(e) => setEditComprador(e.target.value)}
                        placeholder={
                          looksLikeRentedStatusSala(editStatusSala) && !looksLikeSoldStatusSala(editStatusSala)
                            ? "Nome do locatário"
                            : "Pode coincidir com o nome da sala"
                        }
                        autoComplete="off"
                      />
                    )}
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
                    <label className="em-label" htmlFor="room-valor-imovel">
                      Valor do imóvel (R$)
                    </label>
                    {readOnly ? (
                      <div className="em-input em-readonly">{formatMoneyBRL(editingRoom.meta?.valorImovel)}</div>
                    ) : (
                      <input
                        id="room-valor-imovel"
                        className="em-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Ex.: 1500000 ou 1500000,50"
                        value={editValorImovel}
                        onChange={(e) => setEditValorImovel(e.target.value)}
                      />
                    )}
                  </div>
                  {isViewer ? null : (
                    <div className="em-field">
                      <label className="em-label" htmlFor="room-valor-m2">
                        Valor m²
                      </label>
                      {readOnly ? (
                        <div className="em-input em-readonly">
                          {editingRoom.meta?.valorM2 != null && Number.isFinite(editingRoom.meta.valorM2)
                            ? formatDecimalBRL(editingRoom.meta.valorM2)
                            : "—"}
                        </div>
                      ) : (
                        <input
                          id="room-valor-m2"
                          className="em-input"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Ex.: 12500,50"
                          value={editValorM2}
                          onChange={(e) => setEditValorM2(e.target.value)}
                        />
                      )}
                    </div>
                  )}
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

              {hideReportAndPaymentUi ? null : (
                <>
                  <div className="em-section">
                    <div className="em-section-title">Precificação / relatório</div>
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
                        <div className="em-input em-readonly">{formatMoneyBRL(editingRoom.meta?.baseCalculoVenda)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="em-section">
                    <div className="em-section-title">Pagamento e fechamento (gestor)</div>
                    <div className="em-grid em-grid-2">
                      <div className="em-field">
                        <label className="em-label" htmlFor="room-forma-pag">
                          Forma de pagamento
                        </label>
                        {readOnly ? (
                          <div className="em-input em-readonly">{editingRoom.meta?.formaPagamento?.trim() || "—"}</div>
                        ) : (
                          <input
                            id="room-forma-pag"
                            className="em-input"
                            value={editFormaPagamento}
                            onChange={(e) => setEditFormaPagamento(e.target.value)}
                            placeholder="Ex.: financiamento, permuta…"
                            autoComplete="off"
                          />
                        )}
                      </div>
                      <div className="em-field">
                        <label className="em-label" htmlFor="room-prazo-pag">
                          Prazo de pagamento
                        </label>
                        {readOnly ? (
                          <div className="em-input em-readonly">{editingRoom.meta?.prazoPagamento?.trim() || "—"}</div>
                        ) : (
                          <input
                            id="room-prazo-pag"
                            className="em-input"
                            value={editPrazoPagamento}
                            onChange={(e) => setEditPrazoPagamento(e.target.value)}
                            placeholder="Observações de prazo"
                            autoComplete="off"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
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
