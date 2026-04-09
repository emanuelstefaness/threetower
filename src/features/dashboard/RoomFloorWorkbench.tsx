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

/** Aceita vazio (limpa), ponto ou vírgula decimal; remove separadores de milhar comuns. */
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

function looksLikeSoldStatus(statusSala: string): boolean {
  return /\bvend/i.test(statusSala.trim());
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
  const [editValorVenda, setEditValorVenda] = useState("");
  const [editDescontos, setEditDescontos] = useState("");

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
    setEditValorVenda(m?.valorVenda != null && Number.isFinite(m.valorVenda) ? String(m.valorVenda) : "");
    setEditDescontos(m?.descontos != null && Number.isFinite(m.descontos) ? String(m.descontos) : "");
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

      let valorImovel: number | null;
      let valorM2: number | null;
      let baseCalculoVenda: number | null;
      let valorVenda: number | null;
      let descontos: number | null;
      try {
        valorImovel = parseOptionalMoney(editValorImovel);
        valorM2 = parseOptionalMoney(editValorM2);
        baseCalculoVenda = parseOptionalMoney(editBaseCalculo);
        valorVenda = parseOptionalMoney(editValorVenda);
        descontos = parseOptionalMoney(editDescontos);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Valor inválido", "⚠️");
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
        valorVenda,
        descontos,
      });

      const { snapshot, appMode: mode, authEnabled, authRole: r, authName: an } = await fetchBuildingState();
      setBuilding(snapshot, mode, authEnabled, r, an);
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
                <p className="em-hint" style={{ marginTop: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.45 }}>
                  Status <strong>RESERVADA</strong>: ao gravar, regista-se quem fez a reserva. Após 72 horas é mostrado um aviso informativo; a reserva não é removida automaticamente.
                </p>
              </div>

              {editingRoom?.status === "reservada" && (editingRoom.meta?.reservedByName || editingRoom.meta?.reservedAt) ? (
                <div className="em-section">
                  <div className="em-section-title">Reserva</div>
                  {editingRoom.meta?.reservedByName ? (
                    <div className="em-readonly-banner" style={{ marginBottom: 8 }}>
                      Reservado por: <strong>{editingRoom.meta.reservedByName}</strong>
                      {editingRoom.meta.reservedByLogin ? (
                        <span style={{ opacity: 0.75 }}> ({editingRoom.meta.reservedByLogin})</span>
                      ) : null}
                    </div>
                  ) : null}
                  {typeof editingRoom.meta?.reservedAt === "number" &&
                  Date.now() - editingRoom.meta.reservedAt > 72 * 60 * 60 * 1000 ? (
                    <div
                      className="em-readonly-banner"
                      style={{ borderColor: "rgba(245, 158, 11, 0.45)", background: "rgba(245, 158, 11, 0.12)" }}
                    >
                      Esta reserva tem mais de <strong>72 horas</strong>. Trata-se apenas de um lembrete — o estado da sala não muda sozinho.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="em-section">
                <div className="em-section-title">
                  {looksLikeSoldStatus(editStatusSala) ? "Venda — corretagem e comprador" : "Corretagem e comprador (preencher ao vender)"}
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
                      Comprador
                    </label>
                    {readOnly ? (
                      <div className="em-input em-readonly">{editingRoom.meta?.comprador?.trim() || "—"}</div>
                    ) : (
                      <input
                        id="room-comprador"
                        className="em-input"
                        value={editComprador}
                        onChange={(e) => setEditComprador(e.target.value)}
                        placeholder="Pode coincidir com o nome da sala"
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
                      <div className="em-input em-readonly">{formatMoneyBRL(editingRoom.meta?.valorImovel) || "—"}</div>
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
                        <div className="em-input em-readonly">{editingRoom.meta?.valorM2 ?? "—"}</div>
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
                        <div className="em-input em-readonly">{editingRoom.meta?.baseCalculoVenda ?? "—"}</div>
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
                      <div className="em-field">
                        <label className="em-label" htmlFor="room-valor-venda">
                          Valor da venda (R$)
                        </label>
                        {readOnly ? (
                          <div className="em-input em-readonly">{formatMoneyBRL(editingRoom.meta?.valorVenda) || "—"}</div>
                        ) : (
                          <input
                            id="room-valor-venda"
                            className="em-input"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Opcional"
                            value={editValorVenda}
                            onChange={(e) => setEditValorVenda(e.target.value)}
                          />
                        )}
                      </div>
                      <div className="em-field">
                        <label className="em-label" htmlFor="room-descontos">
                          Descontos (R$)
                        </label>
                        {readOnly ? (
                          <div className="em-input em-readonly">{formatMoneyBRL(editingRoom.meta?.descontos) || "—"}</div>
                        ) : (
                          <input
                            id="room-descontos"
                            className="em-input"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Opcional"
                            value={editDescontos}
                            onChange={(e) => setEditDescontos(e.target.value)}
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
