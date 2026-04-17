"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchBuildingState } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { MinimalUiToggle } from "@/features/ui/MinimalUiToggle";
import { canAccessInbox, canAccessReports, canAccessTvPanel } from "@/lib/authUi";
import { formatMoneyBRL } from "@/lib/formatMoney";
import {
  mergeTargetsWithSimulation,
  isTargetSimulated,
  type SimulatedByMonth,
  type SalesTargetEntry,
  type TargetsMap,
} from "@/lib/vendasReportTargets";
import type { RoomRecord } from "@/lib/buildingTypes";
import {
  aggregateVendasPorMes,
  formatMonthLabelPt,
  formatSaleDateIsoLocal,
  monthKeyFromTs,
  valorVendaBase,
  valorVendido,
  vendidoMomentoRelatorio,
  type VendaMesRow,
  type VendaReportDateFonte,
} from "@/lib/vendasMensaisAgg";
import VendasPeriodDashboardCharts from "./VendasPeriodDashboardCharts";

const PERIOD_OPTIONS = [6, 12, 18, 24, 36] as const;

type MetasDraftRow = { quantidade: string; faturamento: string; n40: string; n140: string };

function emptyMetasDraftRow(): MetasDraftRow {
  return { quantidade: "", faturamento: "", n40: "", n140: "" };
}

function buildMetasDraftFromApi(rows: VendaMesRow[], api: TargetsMap): Record<string, MetasDraftRow> {
  const out: Record<string, MetasDraftRow> = {};
  for (const r of rows) {
    const t = api[r.monthKey];
    out[r.monthKey] = {
      quantidade: t?.quantidade != null && Number.isFinite(t.quantidade) ? String(t.quantidade) : "",
      faturamento: t?.faturamento != null && Number.isFinite(t.faturamento) ? String(t.faturamento) : "",
      n40: t?.n40 != null && Number.isFinite(t.n40) ? String(t.n40) : "",
      n140: t?.n140 != null && Number.isFinite(t.n140) ? String(t.n140) : "",
    };
  }
  return out;
}

function parseMoneyDraft(raw: string): number | undefined {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return undefined;
  let n = t;
  if (n.includes(",") && n.includes(".")) n = n.replace(/\./g, "").replace(",", ".");
  else if (n.includes(",")) n = n.replace(",", ".");
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  return v;
}

function parseCountDraft(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const v = Number(t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(v) || v < 0) return undefined;
  return Math.floor(v);
}

function draftRowToStored(d: MetasDraftRow): SalesTargetEntry | null {
  const out: SalesTargetEntry = {};
  const q = parseCountDraft(d.quantidade);
  if (q !== undefined && q > 0) out.quantidade = q;
  const fat = parseMoneyDraft(d.faturamento);
  if (fat !== undefined) out.faturamento = fat;
  const n40 = parseCountDraft(d.n40);
  if (n40 !== undefined && n40 > 0) out.n40 = n40;
  const n140 = parseCountDraft(d.n140);
  if (n140 !== undefined && n140 > 0) out.n140 = n140;
  return Object.keys(out).length > 0 ? out : null;
}

export default function TowerAlfaVendasMensaisClient() {
  const pathname = usePathname();
  const { building, appMode, authRole, authEnabled, authLogin, applyEvent, setBuilding, setRealtime } =
    useBuildingStoreClient();
  const [clock, setClock] = useState(() => new Date());
  const [periodMonths, setPeriodMonths] = useState<number>(12);
  const [apiTargets, setApiTargets] = useState<TargetsMap>({});
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode: mode, authEnabled, authRole: r, authName, authLogin: al }) => {
        if (!alive) return;
        setBuilding(snapshot, mode, authEnabled, r, authName, al);
      })
      .catch((e) => {
        if (!alive) return;
        setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" });
      });
    return () => {
      alive = false;
    };
  }, [setBuilding, setRealtime]);

  useEffect(() => {
    const es = new EventSource("/api/events");
    setRealtime({ connected: true, lastError: null });
    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        if (evt?.type === "room_status_changed") applyEvent(evt);
      } catch {
        // ignore
      }
    };
    es.onerror = () => setRealtime({ connected: false, lastError: "Conexão com tempo real perdida" });
    return () => es.close();
  }, [applyEvent, setRealtime]);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const reloadTargets = useCallback(async () => {
    try {
      const r = await fetch("/api/reports/sales-targets", { credentials: "include" });
      const j: { targets?: TargetsMap } = r.ok ? await r.json() : { targets: {} };
      setApiTargets(j?.targets && typeof j.targets === "object" ? j.targets : {});
    } catch {
      setApiTargets({});
    }
  }, []);

  useEffect(() => {
    void reloadTargets();
  }, [reloadTargets]);

  const vendasPorMes = useMemo(() => aggregateVendasPorMes(building, periodMonths), [building, periodMonths]);

  const [metasDraft, setMetasDraft] = useState<Record<string, MetasDraftRow>>({});
  const [metasSaving, setMetasSaving] = useState(false);
  const [metasMessage, setMetasMessage] = useState<string | null>(null);

  const metasRowsKey = useMemo(() => vendasPorMes.rows.map((r) => r.monthKey).join("|"), [vendasPorMes.rows]);

  useEffect(() => {
    setMetasDraft(buildMetasDraftFromApi(vendasPorMes.rows, apiTargets));
  }, [metasRowsKey, apiTargets]);

  const canEditMetas = !authEnabled || authRole === "gestor";

  const saveMetas = useCallback(async () => {
    if (!canEditMetas) return;
    setMetasMessage(null);
    const merged: TargetsMap = { ...apiTargets };
    for (const r of vendasPorMes.rows) {
      const rowDraft = metasDraft[r.monthKey] ?? emptyMetasDraftRow();
      const entry = draftRowToStored(rowDraft);
      if (entry == null) delete merged[r.monthKey];
      else merged[r.monthKey] = entry;
    }
    setMetasSaving(true);
    try {
      const res = await fetch("/api/reports/sales-targets", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: merged }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; targets?: TargetsMap };
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Falha ao gravar");
      setApiTargets(j.targets && typeof j.targets === "object" ? j.targets : merged);
      setMetasMessage("Metas guardadas.");
    } catch (e) {
      setMetasMessage(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setMetasSaving(false);
    }
  }, [apiTargets, canEditMetas, metasDraft, vendasPorMes.rows]);

  useEffect(() => {
    const id = window.setInterval(() => {
      fetchBuildingState()
        .then(({ snapshot, appMode: mode, authEnabled, authRole: r, authName, authLogin: al }) =>
          setBuilding(snapshot, mode, authEnabled, r, authName, al)
        )
        .catch(() => void 0);
    }, 20000);
    return () => window.clearInterval(id);
  }, [setBuilding]);

  const salasNoMesGrafico = useMemo(() => {
    if (!building?.roomsById || !selectedMonthKey) return [];
    const rows: { room: RoomRecord; atMs: number; fonte: VendaReportDateFonte }[] = [];
    for (const room of Object.values(building.roomsById)) {
      const det = vendidoMomentoRelatorio(room);
      if (!det) continue;
      if (monthKeyFromTs(det.atMs) !== selectedMonthKey) continue;
      rows.push({ room, atMs: det.atMs, fonte: det.fonte });
    }
    rows.sort((a, b) => a.room.id - b.room.id);
    return rows;
  }, [building, selectedMonthKey]);

  const { targets: targetsEffective, simulated: targetsSimulated } = useMemo(
    () => mergeTargetsWithSimulation(vendasPorMes.rows, apiTargets),
    [vendasPorMes.rows, apiTargets],
  );

  useEffect(() => {
    const keys = vendasPorMes.rows.map((r) => r.monthKey);
    if (keys.length === 0) {
      setSelectedMonthKey("");
      return;
    }
    setSelectedMonthKey((prev) => (prev && keys.includes(prev) ? prev : keys[keys.length - 1]!));
  }, [vendasPorMes.rows]);

  return (
    <>
      <header className="topbar">
        <BrandLogo />
        {appMode === "view" ? (
          <div className="app-mode-pill" title="Edição desativada no servidor">
            Somente leitura
          </div>
        ) : null}
        <AuthLogoutButton />
        <div className="top-spacer" />
        <div className="clock">{clock.toLocaleTimeString("pt-BR")}</div>
      </header>

      <div className="layout reports-layout">
        <aside className="sidebar">
          <div className="sb-header">Painel</div>
          <div className="sb-nav">
            <Link href="/" className={`sb-item ${pathname === "/" ? "active" : ""}`}>
              Dashboard
            </Link>
            <Link href="/rooms" className={`sb-item ${pathname.startsWith("/rooms") ? "active" : ""}`}>
              Salas
            </Link>
            {canAccessTvPanel(authLogin) ? (
              <Link href="/panel" className={`sb-item ${pathname.startsWith("/panel") ? "active" : ""}`}>
                Painel TV
              </Link>
            ) : null}
            {canAccessInbox(authRole, authEnabled) ? (
              <Link href="/inbox" className={`sb-item ${pathname.startsWith("/inbox") ? "active" : ""}`}>
                Reservas
              </Link>
            ) : null}
            {canAccessReports(authRole, authEnabled) ? (
              <>
                <Link href="/reports" className={`sb-item ${pathname === "/reports" ? "active" : ""}`}>
                  Relatórios
                </Link>
                <Link href="/reports/vendas" className={`sb-item ${pathname.startsWith("/reports/vendas") ? "active" : ""}`}>
                  Vendas por período
                </Link>
              </>
            ) : null}
          </div>

          <div className="sb-divider" />
          <div className="sb-section">Período (gráficos)</div>
          <div className="sb-manage reports-sb-manage">
            <div className="em-field">
              <label className="em-label" htmlFor="vendas-periodo">
                Janela
              </label>
              <select
                id="vendas-periodo"
                className="em-select"
                value={periodMonths}
                onChange={(e) => setPeriodMonths(Number(e.target.value))}
              >
                {PERIOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    Últimos {m} meses
                  </option>
                ))}
              </select>
            </div>
            <p className="report-vendas-sidebar-hint">
              Cada venda entra no <strong>mês civil da data de venda</strong> da sala (Salas). O eixo prolonga-se para trás
              se houver vendas com data antes dos “últimos N meses” (até 72 meses no total). Quantidade, tipologia (~40 / ~140
              m²) e valor vendido somam por esse mês. As <strong>metas</strong> são definidas no cartão “Metas do período”
              (gestores); onde não houver meta, o gráfico usa uma <strong>prévia simulada</strong>.
            </p>
          </div>

          <div className="sb-divider" />
          <div className="sb-section">Conta</div>
          <div className="sb-manage">
            <MinimalUiToggle />
          </div>
        </aside>

        <div className="reports-content">
          <main className="main reports-main">
            <div className="report-hero">
              <div className="report-hero-left">
                <div className="report-title">Vendas por período</div>
              </div>
              <div className="report-hero-right">
                <div className="report-chip">
                  <span className="report-chip-dot" />
                  Três gráficos interativos + tabela
                </div>
              </div>
            </div>

            {vendasPorMes.totais.qtd === 0 ? (
              <p className="report-vendas-intro" style={{ color: "var(--text2)" }}>
                Nesta janela de meses não há vendas contabilizadas. O relatório usa o mês da <strong>data de venda</strong> em
                cada sala (status VENDIDO). Aumenta a janela ou confere as datas no módulo Salas.
              </p>
            ) : null}

            {vendasPorMes.rows.length > 0 ? (
              <div className="report-panel report-vendas-metas-panel">
                <div className="report-panel-head">Metas do período (gestão)</div>
                <p className="report-vendas-metas-intro">
                  Defina, por mês civil, a meta de <strong>salas vendidas</strong> e o <strong>faturamento</strong> alvo
                  (valor vendido somado). Opcional: metas por tipologia (~40 m² e ~140 m²). Os gráficos e a tabela usam estes
                  valores em vez da prévia simulada.
                </p>
                {metasMessage ? (
                  <div
                    className={`report-vendas-metas-feedback${metasMessage.includes("Erro") || metasMessage.includes("Falha") ? " report-vendas-metas-feedback--err" : ""}`}
                  >
                    {metasMessage}
                  </div>
                ) : null}
                <div className="report-vendas-metas-scroll">
                  <table className="report-vendas-metas-table">
                    <thead>
                      <tr>
                        <th>Mês</th>
                        <th className="num">Meta salas</th>
                        <th className="num">Meta faturamento (R$)</th>
                        <th className="num">Meta ~40 m²</th>
                        <th className="num">Meta ~140 m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendasPorMes.rows.map((r) => {
                        const d = metasDraft[r.monthKey] ?? emptyMetasDraftRow();
                        return (
                          <tr key={`meta-${r.monthKey}`}>
                            <td>{formatMonthLabelPt(r.monthKey)}</td>
                            <td className="num">
                              <input
                                className="report-vendas-metas-input"
                                type="text"
                                inputMode="numeric"
                                disabled={!canEditMetas}
                                value={d.quantidade}
                                onChange={(e) =>
                                  setMetasDraft((prev) => ({
                                    ...prev,
                                    [r.monthKey]: { ...d, quantidade: e.target.value },
                                  }))
                                }
                                placeholder="—"
                              />
                            </td>
                            <td className="num">
                              <input
                                className="report-vendas-metas-input report-vendas-metas-input--wide"
                                type="text"
                                inputMode="decimal"
                                disabled={!canEditMetas}
                                value={d.faturamento}
                                onChange={(e) =>
                                  setMetasDraft((prev) => ({
                                    ...prev,
                                    [r.monthKey]: { ...d, faturamento: e.target.value },
                                  }))
                                }
                                placeholder="—"
                              />
                            </td>
                            <td className="num">
                              <input
                                className="report-vendas-metas-input"
                                type="text"
                                inputMode="numeric"
                                disabled={!canEditMetas}
                                value={d.n40}
                                onChange={(e) =>
                                  setMetasDraft((prev) => ({
                                    ...prev,
                                    [r.monthKey]: { ...d, n40: e.target.value },
                                  }))
                                }
                                placeholder="—"
                              />
                            </td>
                            <td className="num">
                              <input
                                className="report-vendas-metas-input"
                                type="text"
                                inputMode="numeric"
                                disabled={!canEditMetas}
                                value={d.n140}
                                onChange={(e) =>
                                  setMetasDraft((prev) => ({
                                    ...prev,
                                    [r.monthKey]: { ...d, n140: e.target.value },
                                  }))
                                }
                                placeholder="—"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="report-vendas-metas-actions">
                  {canEditMetas ? (
                    <>
                      <button type="button" className="em-btn em-save" disabled={metasSaving} onClick={() => void saveMetas()}>
                        {metasSaving ? "A guardar…" : "Guardar metas"}
                      </button>
                      <button
                        type="button"
                        className="em-btn em-cancel"
                        disabled={metasSaving}
                        onClick={() => {
                          setMetasMessage(null);
                          void reloadTargets();
                        }}
                      >
                        Recarregar do servidor
                      </button>
                    </>
                  ) : (
                    <span className="report-vendas-metas-readonly">Apenas gestores podem editar metas.</span>
                  )}
                </div>
              </div>
            ) : null}

            <div className="report-vendas-month-toolbar">
              <label className="em-label" htmlFor="vendas-mes-detalhe">
                Mês para detalhe
              </label>
              <select
                id="vendas-mes-detalhe"
                className="em-select report-vendas-month-select"
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
              >
                {vendasPorMes.rows.map((r) => (
                  <option key={r.monthKey} value={r.monthKey}>
                    {formatMonthLabelPt(r.monthKey)}
                  </option>
                ))}
              </select>
            </div>

            {vendasPorMes.rows.length > 0 ? (
              <div className="report-panel report-panel--vendas-dash">
                <VendasPeriodDashboardCharts building={building} rows={vendasPorMes.rows} targets={targetsEffective} />
              </div>
            ) : null}

            {selectedMonthKey && vendasPorMes.rows.length > 0 ? (
              <div className="report-panel report-panel--vendas-mes-detalhe">
                <div className="report-panel-head">
                  Salas no mês {formatMonthLabelPt(selectedMonthKey)} (data usada no gráfico)
                </div>
                {salasNoMesGrafico.length === 0 ? (
                  <p className="report-vendas-mes-detalhe-empty">
                    Nenhuma venda contabilizada neste mês na janela selecionada. As barras usam a <strong>data da venda</strong>{" "}
                    na sala; na falta dela, uma alteração real de status para VENDIDO no histórico (não a data de importação).
                  </p>
                ) : (
                  <div className="report-sales-table-wrap">
                    <table className="report-sales-table report-sales-table--compact">
                      <thead>
                        <tr>
                          <th>Unid.</th>
                          <th>Nome</th>
                          <th>Data (relatório)</th>
                          <th>Origem da data</th>
                          <th className="num">Valor de venda</th>
                          <th className="num">Valor vendido</th>
                          <th className="num">Desconto/Acréscimo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salasNoMesGrafico.map(({ room, atMs, fonte }) => {
                          const base = valorVendaBase(room);
                          const vendido = valorVendido(room);
                          const delta = base - vendido;
                          const labelFonte =
                            fonte === "data_sala" ? "Campo data na sala" : "Histórico (VENDIDO)";
                          return (
                            <tr key={`vm-sala-${room.id}`}>
                              <td className="mono">{room.id}</td>
                              <td>{room.name}</td>
                              <td>
                                {new Date(atMs).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })}{" "}
                                <span className="report-vendas-mes-detalhe-iso">({formatSaleDateIsoLocal(atMs)})</span>
                              </td>
                              <td>{labelFonte}</td>
                              <td className="num">{base > 0 ? formatMoneyBRL(base) : "—"}</td>
                              <td className="num">{vendido > 0 ? formatMoneyBRL(vendido) : "—"}</td>
                              <td className="num">
                                {base > 0 && vendido > 0
                                  ? `${delta >= 0 ? "-" : "+"} ${formatMoneyBRL(Math.abs(delta))}`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            <div className="report-panel">
              <div className="report-panel-head">Tabela · últimos {periodMonths} meses</div>
              <div className="report-sales-table-wrap">
                <table className="report-sales-table">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th className="num">Qtd.</th>
                      <th className="num">Meta qtd</th>
                      <th className="num">Valor vendido</th>
                      <th className="num">Meta fat.</th>
                      <th className="num">40 m²</th>
                      <th className="num" title="Meta unidades ~40 m²">
                        Meta 40
                      </th>
                      <th className="num">140 m²</th>
                      <th className="num" title="Meta unidades ~140 m²">
                        Meta 140
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasPorMes.rows.map((r) => {
                      const tm = targetsEffective[r.monthKey];
                      const sim = targetsSimulated[r.monthKey];
                      const isSel = r.monthKey === selectedMonthKey;
                      const titlePrev = "Prévia simulada (sem meta definida pelo gestor)";
                      return (
                        <tr
                          key={`vm-${r.monthKey}`}
                          className={`${r.qtd === 0 ? "report-sales-row--zero" : ""}${isSel ? " report-sales-row--selected" : ""}`.trim()}
                        >
                          <td>{formatMonthLabelPt(r.monthKey)}</td>
                          <td className="num">{r.qtd}</td>
                          <td className="num" title={sim?.quantidade ? titlePrev : undefined}>
                            {tm?.quantidade != null ? tm.quantidade : "—"}
                          </td>
                          <td className="num">{r.fat > 0 ? formatMoneyBRL(r.fat) : "—"}</td>
                          <td className="num" title={sim?.faturamento ? titlePrev : undefined}>
                            {tm?.faturamento != null ? formatMoneyBRL(tm.faturamento) : "—"}
                          </td>
                          <td className="num">{r.n40}</td>
                          <td className="num" title={sim?.n40 ? titlePrev : undefined}>
                            {tm?.n40 != null ? tm.n40 : "—"}
                          </td>
                          <td className="num">{r.n140}</td>
                          <td className="num" title={sim?.n140 ? titlePrev : undefined}>
                            {tm?.n140 != null ? tm.n140 : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Totais (realizado)</th>
                      <td className="num">{vendasPorMes.totais.qtd}</td>
                      <td className="num">—</td>
                      <td className="num">{vendasPorMes.totais.fat > 0 ? formatMoneyBRL(vendasPorMes.totais.fat) : "—"}</td>
                      <td className="num">—</td>
                      <td className="num">{vendasPorMes.totais.n40}</td>
                      <td className="num">—</td>
                      <td className="num">{vendasPorMes.totais.n140}</td>
                      <td className="num">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
