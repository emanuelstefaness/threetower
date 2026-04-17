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
import {
  areaBasePrecificacaoM2,
  computeValorImovelFromValorM2,
  computeValorM2FromValorImovel,
  divergenciaValorImovelVsM2,
} from "@/lib/precificacaoSala";
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
  const [editValorVenda, setEditValorVenda] = useState("");
  const [editPrecificacao, setEditPrecificacao] = useState("");
  const [editFaixa, setEditFaixa] = useState("");
  const [editCorretor, setEditCorretor] = useState("");
  const [editImobiliaria, setEditImobiliaria] = useState("");
  const [editComprador, setEditComprador] = useState("");
  const [editFormaPagamento, setEditFormaPagamento] = useState("");
  const [editPrazoPagamento, setEditPrazoPagamento] = useState("");
  const [editDataVenda, setEditDataVenda] = useState("");
  const [lastEditedPriceSource, setLastEditedPriceSource] = useState<"valorM2" | "valorImovel" | null>(null);

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

  const editingRoom = editRoomId != null && building ? building.roomsById[editRoomId] : null;

  const divergenciaArmazenada = useMemo(() => {
    if (!editingRoom || isViewer) return null;
    return divergenciaValorImovelVsM2(editingRoom.area, editingRoom.meta?.valorM2, editingRoom.meta?.valorImovel);
  }, [editingRoom, isViewer]);

  const valoresPreview = useMemo(() => {
    const safeParse = (raw: string) => {
      try {
        return parseOptionalMoney(raw);
      } catch {
        return null;
      }
    };
    const imovel = safeParse(editValorImovel);
    const venda = safeParse(editValorVenda);
    if (imovel == null || venda == null) return { desconto: null as number | null, acrescimo: null as number | null };
    const diff = imovel - venda;
    if (diff > 0) return { desconto: diff, acrescimo: 0 };
    if (diff < 0) return { desconto: 0, acrescimo: Math.abs(diff) };
    return { desconto: 0, acrescimo: 0 };
  }, [editValorImovel, editValorVenda]);

  const openEdit = useCallback((room: RoomRecord) => {
    setEditRoomId(room.id);
    setEditName(room.name ?? "");
    setEditStatusSala(canonicalStatusSalaForSelect(room.statusSala ?? room.meta?.statusSalaOriginal ?? ""));
    const m = room.meta;
    setEditValorImovel(m?.valorImovel != null && Number.isFinite(m.valorImovel) ? String(m.valorImovel) : "");
    setEditValorM2(m?.valorM2 != null && Number.isFinite(m.valorM2) ? String(m.valorM2) : "");
    setEditValorVenda(m?.valorVenda != null && Number.isFinite(m.valorVenda) ? String(m.valorVenda) : "");
    setEditPrecificacao(m?.precificacao ?? "");
    setEditFaixa(m?.faixa ?? "");
    setEditCorretor(m?.corretor ?? "");
    setEditImobiliaria(m?.imobiliaria ?? "");
    setEditComprador(m?.comprador ?? "");
    setEditFormaPagamento(m?.formaPagamento ?? "");
    setEditPrazoPagamento(m?.prazoPagamento ?? "");
    setEditDataVenda(formatDateInputFromMs(m?.dataVenda));
    setLastEditedPriceSource(null);
  }, []);

  const handleValorM2Change = useCallback(
    (raw: string) => {
      setEditValorM2(raw);
      setLastEditedPriceSource("valorM2");
      if (!editingRoom) return;
      try {
        const m2 = parseOptionalMoney(raw);
        if (m2 == null || m2 <= 0) {
          if (!raw.trim()) setEditValorImovel("");
          return;
        }
        const nextImovel = computeValorImovelFromValorM2(m2, areaBasePrecificacaoM2(editingRoom.area));
        setEditValorImovel(String(nextImovel));
      } catch {
        // mantém input livre até ficar válido
      }
    },
    [editingRoom],
  );

  const handleValorImovelChange = useCallback(
    (raw: string) => {
      setEditValorImovel(raw);
      setLastEditedPriceSource("valorImovel");
      if (!editingRoom) return;
      try {
        const imovel = parseOptionalMoney(raw);
        if (imovel == null || imovel <= 0) {
          if (!raw.trim()) setEditValorM2("");
          return;
        }
        const nextM2 = computeValorM2FromValorImovel(imovel, areaBasePrecificacaoM2(editingRoom.area));
        setEditValorM2(String(nextM2));
      } catch {
        // mantém input livre até ficar válido
      }
    },
    [editingRoom],
  );

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
      let valorVenda: number | null;
      let dataVenda: number | null;
      try {
        valorImovel = parseOptionalMoney(editValorImovel);
        valorM2 = parseOptionalMoney(editValorM2);
        valorVenda = parseOptionalMoney(editValorVenda);
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

      if (!isViewer && !editValorM2.trim()) {
        showToast("Indique o valor do m² — a partir dele o sistema calcula o valor do imóvel.", "⚠️");
        return;
      }

      await updateRoomDetails(editRoomId, {
        name: nextName,
        statusSala: next,
        by: authName?.trim() || "admin",
        valorImovel,
        valorM2,
        valorVenda,
        descontos:
          valorImovel != null && valorVenda != null && Number.isFinite(valorImovel) && Number.isFinite(valorVenda)
            ? valorImovel - valorVenda
            : null,
        priceSource: lastEditedPriceSource,
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
                    <div className="em-label">Base de precificação</div>
                    <div className="em-input em-readonly">
                      {areaBasePrecificacaoM2(editingRoom.area)} m²{" "}
                      <span style={{ opacity: 0.75, fontSize: 10 }}>(40 ou 140 conforme a área da sala)</span>
                    </div>
                  </div>
                  {isViewer ? null : (
                    <div className="em-field">
                      <label className="em-label" htmlFor="room-faixa-input">
                        Faixa
                      </label>
                      {readOnly ? (
                        <div className="em-input em-readonly">{editingRoom.meta?.faixa?.trim() || "—"}</div>
                      ) : (
                        <input
                          id="room-faixa-input"
                          className="em-input"
                          value={editFaixa}
                          onChange={(e) => setEditFaixa(e.target.value)}
                          placeholder="Ex.: Faixa 3"
                          autoComplete="off"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {hideReportAndPaymentUi ? null : (
                <div className="em-section">
                  <div className="em-section-title">Valores</div>
                  <div className="em-grid em-grid-2">
                    <div className="em-field">
                      <label className="em-label" htmlFor="room-valor-imovel">
                        Valor do imóvel
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
                          placeholder="Ex.: 560000"
                          value={editValorImovel}
                          onChange={(e) => handleValorImovelChange(e.target.value)}
                        />
                      )}
                    </div>
                    <div className="em-field">
                      <label className="em-label" htmlFor="room-valor-venda">
                        Valor vendido
                      </label>
                      {readOnly ? (
                        <div className="em-input em-readonly">{formatMoneyBRL(editingRoom.meta?.valorVenda)}</div>
                      ) : (
                        <input
                          id="room-valor-venda"
                          className="em-input"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="Ex.: 370000"
                          value={editValorVenda}
                          onChange={(e) => setEditValorVenda(e.target.value)}
                        />
                      )}
                    </div>
                    <div className="em-field">
                      <div className="em-label">Desconto</div>
                      <div className="em-input em-readonly">
                        {readOnly
                          ? formatMoneyBRL(
                              typeof editingRoom.meta?.descontos === "number" && editingRoom.meta.descontos > 0
                                ? editingRoom.meta.descontos
                                : 0,
                            )
                          : formatMoneyBRL(valoresPreview.desconto)}
                      </div>
                    </div>
                    <div className="em-field">
                      <div className="em-label">Acréscimo</div>
                      <div className="em-input em-readonly">
                        {readOnly
                          ? formatMoneyBRL(
                              typeof editingRoom.meta?.descontos === "number" && editingRoom.meta.descontos < 0
                                ? Math.abs(editingRoom.meta.descontos)
                                : 0,
                            )
                          : formatMoneyBRL(valoresPreview.acrescimo)}
                      </div>
                    </div>
                    <div className="em-field" style={{ gridColumn: "1 / -1" }}>
                      <label className="em-label" htmlFor="room-valor-m2">
                        Valor do m²
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
                          onChange={(e) => handleValorM2Change(e.target.value)}
                        />
                      )}
                      {!readOnly ? (
                        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85, lineHeight: 1.45 }}>
                          Campos vinculados: ao alterar <strong>m²</strong> o imóvel é recalculado, e ao alterar{" "}
                          <strong>imóvel</strong> o m² é recalculado (base {areaBasePrecificacaoM2(editingRoom.area)} m²).
                          {divergenciaArmazenada &&
                          divergenciaArmazenada.rel > 0.002 &&
                          editingRoom.meta?.valorM2 != null &&
                          Number.isFinite(editingRoom.meta.valorM2) ? (
                            <div style={{ marginTop: 6, color: "rgba(251, 191, 36, 0.95)" }}>
                              Conferência: com o m² <strong>guardado</strong> ({formatDecimalBRL(editingRoom.meta.valorM2)})
                              × {areaBasePrecificacaoM2(editingRoom.area)} m², o esperado seria{" "}
                              {formatMoneyBRL(
                                computeValorImovelFromValorM2(
                                  editingRoom.meta.valorM2,
                                  areaBasePrecificacaoM2(editingRoom.area),
                                ),
                              )}
                              .
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {!isViewer && (editingRoom.meta?.faixaPrecoHistorico?.length ?? 0) > 0 ? (
                <div className="em-section">
                  <div className="em-section-title">Histórico de faixas e valor m²</div>
                  <div style={{ maxHeight: 180, overflowY: "auto", fontSize: 11, lineHeight: 1.45 }}>
                    {(editingRoom.meta?.faixaPrecoHistorico ?? []).map((h, idx) => (
                      <div
                        key={`${h.at}-${idx}`}
                        style={{
                          padding: "6px 8px",
                          marginBottom: 6,
                          borderRadius: 6,
                          background: "rgba(148, 163, 184, 0.08)",
                          border: "1px solid rgba(148, 163, 184, 0.2)",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {new Date(h.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                          {h.faixa}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          m²: {formatDecimalBRL(h.valorM2)} · base {h.areaBaseM2} m² · imóvel: {formatMoneyBRL(h.valorImovel)}
                        </div>
                        <div style={{ opacity: 0.65, fontSize: 10 }}>por {h.by}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

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
                        <div className="em-label">Base cálculo (m²)</div>
                        <div className="em-input em-readonly">
                          {editingRoom.meta?.baseCalculoVenda != null && Number.isFinite(editingRoom.meta.baseCalculoVenda)
                            ? `${editingRoom.meta.baseCalculoVenda} m²`
                            : `${areaBasePrecificacaoM2(editingRoom.area)} m²`}
                        </div>
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
