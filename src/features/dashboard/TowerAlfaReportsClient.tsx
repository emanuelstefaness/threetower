"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RoomRecord } from "@/lib/buildingTypes";
import { fetchBuildingState } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { MinimalUiToggle } from "@/features/ui/MinimalUiToggle";
import { canAccessInbox, canAccessReports } from "@/lib/authUi";
import { formatDecimalBRL, formatMoneyBRL } from "@/lib/formatMoney";
import { colorForStatusSala, normalizeStatusSala } from "@/lib/treeTowerStatusSala";

function DonutPaths({ segments }: { segments: Array<{ key: string; value: number; color: string }> }) {
  const totalAll = segments.reduce((s, item) => s + item.value, 0);
  const cx = 74;
  const cy = 74;
  const R = 62;
  const r = 42;

  if (!totalAll) return null;

  let angle = -Math.PI / 2;

  return (
    <>
      {segments.map((item) => {
        const value = item.value;
        const sw = (value / totalAll) * Math.PI * 2;

        const x1 = cx + R * Math.cos(angle);
        const y1 = cy + R * Math.sin(angle);
        const x2 = cx + R * Math.cos(angle + sw);
        const y2 = cy + R * Math.sin(angle + sw);

        const xi1 = cx + r * Math.cos(angle);
        const yi1 = cy + r * Math.sin(angle);
        const xi2 = cx + r * Math.cos(angle + sw);
        const yi2 = cy + r * Math.sin(angle + sw);

        const lg = sw > Math.PI ? 1 : 0;
        const pathD = `M${x1},${y1} A${R},${R},0,${lg},1,${x2},${y2} L${xi2},${yi2} A${r},${r},0,${lg},0,${xi1},${yi1} Z`;

        const el = (
          <path
            key={`donut-${item.key}`}
            d={pathD}
            fill={item.color}
            opacity={0.85}
            stroke="#111827"
            strokeWidth={2}
          />
        );

        angle += sw;
        return el;
      })}
    </>
  );
}

function formatDateTime(d: number) {
  return new Date(d).toLocaleString("pt-BR");
}

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Faturamento da venda: `valorVenda` (aba Oficial), senão `valorImovel` como referência. */
function valorFaturamentoVenda(r: RoomRecord): number {
  const m = r.meta;
  if (!m) return 0;
  if (typeof m.valorVenda === "number" && Number.isFinite(m.valorVenda)) return m.valorVenda;
  if (typeof m.valorImovel === "number" && Number.isFinite(m.valorImovel)) return m.valorImovel;
  return 0;
}

function valorImovelMeta(r: RoomRecord): number {
  const v = r.meta?.valorImovel;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export default function TowerAlfaReportsClient() {
  const pathname = usePathname();
  const { building, appMode, authRole, authEnabled, applyEvent, setBuilding, setRealtime } = useBuildingStoreClient();

  const [clock, setClock] = useState(() => new Date());
  const [statusSalaFilter, setStatusSalaFilter] = useState<string[] | "all">("all");
  const [floorFilter, setFloorFilter] = useState<number | "all">("all");
  const [areaMin, setAreaMin] = useState<number>(0);
  const [areaMax, setAreaMax] = useState<number>(99999);
  const [search, setSearch] = useState<string>("");
  const [recentOnly, setRecentOnly] = useState<boolean>(false);
  const [recentDays, setRecentDays] = useState<number>(90);

  const [sortBy, setSortBy] = useState<"lastUpdatedDesc" | "areaDesc" | "floorAsc">("lastUpdatedDesc");
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  // Snapshot inicial
  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode: mode, authEnabled, authRole: r, authName }) => {
        if (!alive) return;
        setBuilding(snapshot, mode, authEnabled, r, authName);
      })
      .catch((e) => {
        if (!alive) return;
        setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" });
      });
    return () => {
      alive = false;
    };
  }, [setBuilding, setRealtime]);

  // SSE (tempo real)
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

  // Relógio
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Atualização completa do snapshot (criações/edições não necessariamente entram via SSE)
  useEffect(() => {
    const id = window.setInterval(() => {
      fetchBuildingState()
        .then(({ snapshot, appMode: mode, authEnabled, authRole: r, authName }) =>
          setBuilding(snapshot, mode, authEnabled, r, authName)
        )
        .catch(() => void 0);
    }, 20000);
    return () => window.clearInterval(id);
  }, [setBuilding]);

  // Normaliza para não explodir em limites inválidos
  useEffect(() => {
    setAreaMin((v) => (Number.isFinite(v) && v >= 0 ? v : 0));
    setAreaMax((v) => (Number.isFinite(v) && v >= 0 ? v : 99999));
  }, []);

  const filteredRooms = useMemo(() => {
    if (!building) return [];

    const q = search.trim().toLowerCase();
    const now = Date.now();
    const maxAge = recentOnly ? startOfDay(now) - recentDays * 24 * 60 * 60 * 1000 : null;

    let rooms = Object.values(building.roomsById);

    if (statusSalaFilter !== "all") {
      const wanted = new Set(statusSalaFilter);
      rooms = rooms.filter((r) => {
        const s = (r.statusSala ?? r.meta?.statusSalaOriginal)?.trim();
        return !!s && wanted.has(s);
      });
    }

    if (floorFilter !== "all") rooms = rooms.filter((r) => r.floor === floorFilter);

    rooms = rooms.filter((r) => r.area >= areaMin && r.area <= areaMax);

    if (q) rooms = rooms.filter((r) => String(r.id).includes(q) || r.name.toLowerCase().includes(q));

    if (maxAge != null) rooms = rooms.filter((r) => r.lastUpdatedAt >= maxAge);

    rooms.sort((a, b) => {
      if (sortBy === "lastUpdatedDesc") return b.lastUpdatedAt - a.lastUpdatedAt;
      if (sortBy === "areaDesc") return b.area - a.area;
      return a.floor - b.floor;
    });

    return rooms;
  }, [building, statusSalaFilter, floorFilter, areaMin, areaMax, search, recentOnly, recentDays, sortBy]);

  // Reset de pagina quando filtros mudam
  useEffect(() => {
    setPage(1);
  }, [statusSalaFilter, floorFilter, areaMin, areaMax, search, recentOnly, recentDays, sortBy]);

  const totalArea = useMemo(() => {
    return filteredRooms.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
  }, [filteredRooms]);

  const statusSalaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of Object.values(building?.roomsById ?? {})) {
      const s = (r.statusSala ?? r.meta?.statusSalaOriginal)?.trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [building]);

  const totalValorImovel = useMemo(() => {
    return filteredRooms.reduce((s, r) => s + valorImovelMeta(r), 0);
  }, [filteredRooms]);

  const vendidas = useMemo(() => {
    const sold = filteredRooms.filter((r) => normalizeStatusSala(r.statusSala ?? r.meta?.statusSalaOriginal) === "VENDIDO");
    const faturamento = sold.reduce((s, r) => s + valorFaturamentoVenda(r), 0);
    const areaTotal = sold.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
    return {
      count: sold.length,
      faturamento,
      areaTotal,
      ticketMedio: sold.length ? faturamento / sold.length : 0,
    };
  }, [filteredRooms]);

  const statusSalaBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of filteredRooms) {
      const key = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, color: colorForStatusSala(name) }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRooms]);
  const statusSalaDonutSegments = useMemo(
    () =>
      statusSalaBreakdown
        .filter((item) => item.count > 0)
        .map((item) => ({ key: item.name, value: item.count, color: item.color })),
    [statusSalaBreakdown]
  );

  const floorsSorted = useMemo(() => {
    if (!building) return [];
    return Object.keys(building.floorAggregates)
      .map((k) => Number(k))
      .sort((a, b) => b - a);
  }, [building]);

  const floorDistributionByStatusSala = useMemo(() => {
    const out = new Map<number, Map<string, number>>();
    for (const f of floorsSorted) out.set(f, new Map<string, number>());
    for (const r of filteredRooms) {
      const statusSala = (r.statusSala ?? r.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
      const bucket = out.get(r.floor) ?? new Map<string, number>();
      bucket.set(statusSala, (bucket.get(statusSala) ?? 0) + 1);
      out.set(r.floor, bucket);
    }
    return out;
  }, [filteredRooms, floorsSorted]);

  const trend = useMemo(() => {
    // Tendência por semana (últimas 12 semanas) baseada em mudanças do status da planilha (statusSalaHistory)
    const weeks = 12;
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const buckets: Array<Map<string, number>> = Array.from({ length: weeks }, () => new Map<string, number>());
    const now = Date.now();

    for (const room of Object.values(building?.roomsById ?? {})) {
      for (const h of room.statusSalaHistory ?? []) {
        if (h.from === "init") continue;
        if (h.from === h.to) continue;
        const age = now - h.at;
        const idxFromEnd = Math.floor(age / msPerWeek);
        if (idxFromEnd < 0 || idxFromEnd >= weeks) continue;
        const idx = (weeks - 1) - idxFromEnd;
        const key = (h.to ?? "").trim() || "Sem status";
        const bucket = buckets[idx] ?? new Map<string, number>();
        bucket.set(key, (bucket.get(key) ?? 0) + 1);
        buckets[idx] = bucket;
      }
    }

    const topKeys = statusSalaBreakdown.slice(0, 4).map((x) => x.name);
    const series = topKeys.map((key) => ({
      key,
      color: colorForStatusSala(key),
      values: buckets.map((b) => b.get(key) ?? 0),
    }));

    return { buckets, series };
  }, [building, statusSalaBreakdown]);

  const recentChanges = useMemo(() => {
    // Lista de eventos recentes (statusSalaHistory entries)
    const changes: { at: number; roomId: number; floor: number; from: string; to: string; by: string }[] = [];
    for (const r of Object.values(building?.roomsById ?? {})) {
      for (const h of r.statusSalaHistory ?? []) {
        if (h.from === "init") continue;
        if (h.from === h.to) continue;
        changes.push({ at: h.at, roomId: r.id, floor: r.floor, from: String(h.from), to: String(h.to), by: h.by });
      }
    }
    changes.sort((a, b) => b.at - a.at);
    return changes.slice(0, 40);
  }, [building]);

  const pagedRooms = useMemo(() => {
    const total = filteredRooms.length;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, maxPage);
    const start = (safePage - 1) * pageSize;
    return {
      total,
      page: safePage,
      maxPage,
      items: filteredRooms.slice(start, start + pageSize),
    };
  }, [filteredRooms, page]);

  const exportCSV = () => {
    const rows: string[][] = [
      [
        "id",
        "nome",
        "andar",
        "area",
        "status_sala_planilha",
        "posicao",
        "matricula",
        "valor_m2",
        "valor_imovel",
        "valor_venda",
        "precificacao",
        "faixa",
        "base_calculo_venda",
        "corretor",
        "imobiliaria",
        "comprador",
        "forma_pagamento",
        "prazo_pagamento",
        "area_coberta_m2",
        "area_descoberta_m2",
        "area_privativa_m2",
        "lastUpdatedAt",
      ],
      ...filteredRooms.map((r) => [
        String(r.id),
        r.name,
        String(r.floor),
        String(r.area),
        r.statusSala ?? r.meta?.statusSalaOriginal ?? "",
        r.meta?.posicao ?? "",
        r.meta?.matricula ?? "",
        r.meta?.valorM2 != null ? formatDecimalBRL(r.meta.valorM2) : "",
        r.meta?.valorImovel != null ? formatMoneyBRL(r.meta.valorImovel) : "",
        r.meta?.valorVenda != null ? formatMoneyBRL(r.meta.valorVenda) : "",
        r.meta?.precificacao ?? "",
        r.meta?.faixa ?? "",
        r.meta?.baseCalculoVenda != null ? formatMoneyBRL(r.meta.baseCalculoVenda) : "",
        r.meta?.corretor ?? "",
        r.meta?.imobiliaria ?? "",
        r.meta?.comprador ?? "",
        r.meta?.formaPagamento ?? "",
        r.meta?.prazoPagamento ?? "",
        r.meta?.areaCobertaM2 != null ? String(r.meta.areaCobertaM2) : "",
        r.meta?.areaDescobertaM2 != null ? String(r.meta.areaDescobertaM2) : "",
        r.meta?.areaPrivativaM2 != null ? String(r.meta.areaPrivativaM2) : "",
        String(r.lastUpdatedAt),
      ]),
    ];
    downloadCSV(`relatorio-salas.csv`, rows);
  };

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
            <Link href="/panel" className={`sb-item ${pathname.startsWith("/panel") ? "active" : ""}`}>
              Painel TV
            </Link>
            {canAccessInbox(authRole, authEnabled) ? (
              <Link href="/inbox" className={`sb-item ${pathname.startsWith("/inbox") ? "active" : ""}`}>
                Reservas
              </Link>
            ) : null}
            {canAccessReports(authRole) ? (
              <Link href="/reports" className={`sb-item ${pathname.startsWith("/reports") ? "active" : ""}`}>
                Relatórios
              </Link>
            ) : null}
          </div>

          <div className="sb-divider" />
          <div className="sb-section">Filtros</div>

          <div className="sb-manage reports-sb-manage">
            <div className="em-field">
              <div className="em-label">Status da sala (planilha)</div>
              <div className="report-status-grid">
                <label className={`report-status-pill ${statusSalaFilter === "all" ? "chosen" : ""}`}>
                  <input
                    type="checkbox"
                    checked={statusSalaFilter === "all"}
                    onChange={(e) => setStatusSalaFilter(e.target.checked ? "all" : [])}
                  />
                  Todos
                </label>
                {statusSalaOptions.map((s) => {
                  const checked = statusSalaFilter !== "all" && statusSalaFilter.includes(s);
                  return (
                    <label key={`ss-${s}`} className={`report-status-pill ${checked ? "chosen" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setStatusSalaFilter((prev) => {
                            const base = prev === "all" ? [] : prev;
                            if (e.target.checked) return base.includes(s) ? base : [...base, s];
                            return base.filter((x) => x !== s);
                          });
                        }}
                      />
                      {s}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="em-field">
              <div className="em-label">Andar</div>
              <select className="em-select" value={floorFilter} onChange={(e) => setFloorFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
                <option value="all">Todos</option>
                {(floorsSorted.length ? floorsSorted : Array.from({ length: 18 }, (_, i) => i + 1)).map((f) => (
                  <option key={`f-${f}`} value={f}>
                    Andar {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="em-field">
              <div className="em-label">Área (min/max)</div>
              <div className="report-range-row">
                <input className="em-input" type="number" value={areaMin} onChange={(e) => setAreaMin(Number(e.target.value))} min={0} />
                <input className="em-input" type="number" value={areaMax} onChange={(e) => setAreaMax(Number(e.target.value))} min={0} />
              </div>
            </div>

            <div className="em-field">
              <div className="em-label">Busca</div>
              <input className="em-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="id ou nome" />
            </div>

            <div className="em-field">
              <div className="em-label">Somente recentes</div>
              <label className="report-recent-toggle">
                <input type="checkbox" checked={recentOnly} onChange={(e) => setRecentOnly(e.target.checked)} />
                <span>Filtrar por últimas</span>
                <select
                  className="em-select"
                  value={recentDays}
                  onChange={(e) => setRecentDays(Number(e.target.value))}
                  disabled={!recentOnly}
                >
                  <option value={30}>30 dias</option>
                  <option value={90}>90 dias</option>
                  <option value={180}>180 dias</option>
                  <option value={365}>365 dias</option>
                </select>
              </label>
            </div>

            <div className="em-field">
              <div className="em-label">Ordenação</div>
              <select className="em-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="lastUpdatedDesc">Última atualização</option>
                <option value="areaDesc">Maior área</option>
                <option value="floorAsc">Menor andar</option>
              </select>
            </div>

            <div className="sb-count" style={{ marginTop: 10, marginBottom: 10 }}>
              {building ? `${filteredRooms.length} salas filtradas` : "—"}
            </div>

            <div className="reports-sb-clear">
              <button
                type="button"
                className="em-btn em-cancel"
                onClick={() => {
                  setStatusSalaFilter("all");
                  setFloorFilter("all");
                  setAreaMin(0);
                  setAreaMax(99999);
                  setSearch("");
                  setRecentOnly(false);
                  setRecentDays(90);
                  setSortBy("lastUpdatedDesc");
                }}
              >
                Limpar filtros
              </button>
            </div>

            <div className="reports-sb-csv-anchor">
              <button type="button" className="em-btn em-save" disabled={!building} onClick={exportCSV}>
                Exportar CSV
              </button>
            </div>
          </div>
        </aside>

        <div className="reports-content">
          <main className="main reports-main">
            <div className="report-hero">
              <div className="report-hero-left">
                <div className="report-title">Relatórios</div>
                <div className="report-sub">
                  Vendas: mostra só faturamento (valor de venda; se faltar, valor do imóvel). O somatório de valor imóvel no filtro está no painel à direita. Tabela e CSV = estado do prédio.
                </div>
              </div>
              <div className="report-hero-right">
                <div className="report-chip">
                  <span className="report-chip-dot" />
                  {building ? `${filteredRooms.length} salas filtradas` : "—"}
                </div>
                <button type="button" className="report-action" onClick={exportCSV}>
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="report-kpi-cards">
              <div className="report-kpi-card">
                <div className="report-kpi-card-label">Salas (filtradas)</div>
                <div className="report-kpi-card-value">{filteredRooms.length}</div>
                <div className="report-kpi-card-sub">Total no filtro atual</div>
              </div>
              <div className="report-kpi-card">
                <div className="report-kpi-card-label">Área total</div>
                <div className="report-kpi-card-value">{Math.round(totalArea * 10) / 10}</div>
                <div className="report-kpi-card-sub">m² somados</div>
              </div>
              <div className="report-kpi-card">
                <div className="report-kpi-card-label">Área média</div>
                <div className="report-kpi-card-value">
                  {filteredRooms.length ? Math.round((totalArea / filteredRooms.length) * 10) / 10 : 0}
                </div>
                <div className="report-kpi-card-sub">m² por sala</div>
              </div>
              <div className="report-kpi-card">
                <div className="report-kpi-card-label">Faturamento (vendas)</div>
                <div className="report-kpi-card-value">{formatMoneyBRL(vendidas.faturamento) || "—"}</div>
                <div className="report-kpi-card-sub">
                  {vendidas.count} unidade{vendidas.count !== 1 ? "s" : ""} · Ticket méd. {formatMoneyBRL(vendidas.ticketMedio) || "—"}
                </div>
              </div>
            </div>

            <div className="report-grid-2">
              <div className="report-panel">
                <div className="report-panel-head">Vendas (status VENDIDO no filtro)</div>
                <div className="report-kpi-list">
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Quantidade</div>
                    <div className="report-kpi-value">{vendidas.count}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Valor de venda / faturamento</div>
                    <div className="report-kpi-value">{formatMoneyBRL(vendidas.faturamento) || "—"}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Ticket médio (valor de venda)</div>
                    <div className="report-kpi-value">{formatMoneyBRL(vendidas.ticketMedio) || "—"}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Área total vendida (m²)</div>
                    <div className="report-kpi-value">{Math.round(vendidas.areaTotal * 10) / 10}</div>
                  </div>
                </div>
              </div>
              <div className="report-panel">
                <div className="report-panel-head">Valor de referência — todas as salas (filtro)</div>
                <div className="report-kpi-list">
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Somatório valor imóvel</div>
                    <div className="report-kpi-value">{formatMoneyBRL(totalValorImovel) || "—"}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Média por sala (filtro)</div>
                    <div className="report-kpi-value">
                      {filteredRooms.length ? formatMoneyBRL(totalValorImovel / filteredRooms.length) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-grid-2">
              <div className="report-panel">
                <div className="report-panel-head">Distribuição por status da sala (filtrada)</div>
                <div className="report-donut-wrap">
                  <svg className="donut-svg" viewBox="0 0 148 148">
                    <DonutPaths segments={statusSalaDonutSegments} />
                  </svg>
                  <div className="donut-center">
                    <div className="donut-total">{filteredRooms.length}</div>
                    <div className="donut-label">salas</div>
                  </div>
                </div>
              </div>

              <div className="report-panel">
                <div className="report-panel-head">Distribuição (detalhada)</div>
                <div className="report-kpi-list report-kpi-list--scroll">
                  {statusSalaBreakdown.map((item) => {
                    const pct = filteredRooms.length ? Math.round((item.count / filteredRooms.length) * 100) : 0;
                    return (
                      <div key={`rk-${item.name}`} className="report-kpi-row">
                        <div className="report-kpi-label" title={item.name}>
                          <span className="report-status-dot" style={{ background: item.color }} />
                          <span className="report-ellipsis">{item.name}</span>
                        </div>
                        <div className="report-kpi-value">{item.count} ({pct}%)</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Removido a pedido: tendência + distribuições extras */}

            <div className="report-panel">
              <div className="report-panel-head">Lista completa de salas (filtrada)</div>

              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nome</th>
                      <th>Andar</th>
                      <th>Área</th>
                      <th>Status (planilha)</th>
                      <th>Posição</th>
                      <th>Valor imóvel</th>
                      <th>Valor venda</th>
                      <th>Valor m²</th>
                      <th>Precificação</th>
                      <th>Faixa</th>
                      <th>Base venda</th>
                      <th>Comprador</th>
                      <th>Corretor</th>
                      <th>Forma pag.</th>
                      <th>Matrícula</th>
                      <th>Atualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRooms.items.map((r) => {
                      return (
                        <tr key={`tr-${r.id}`}>
                          <td>{r.id}</td>
                          <td>{r.name}</td>
                          <td>{r.floor}</td>
                          <td>{r.area}</td>
                          <td>
                            <span className="report-badge" style={{ borderColor: colorForStatusSala(r.statusSala ?? r.meta?.statusSalaOriginal), background: "rgba(148,163,184,0.06)" }}>
                              <span className="report-status-dot" style={{ background: colorForStatusSala(r.statusSala ?? r.meta?.statusSalaOriginal) }} />
                              {(r.statusSala ?? r.meta?.statusSalaOriginal ?? "").trim() || "Sem status"}
                            </span>
                          </td>
                          <td className="report-ellipsis" title={r.meta?.posicao ?? ""}>
                            {r.meta?.posicao ?? ""}
                          </td>
                          <td>{formatMoneyBRL(r.meta?.valorImovel)}</td>
                          <td>{formatMoneyBRL(r.meta?.valorVenda)}</td>
                          <td>{r.meta?.valorM2 != null && Number.isFinite(r.meta.valorM2) ? formatDecimalBRL(r.meta.valorM2) : ""}</td>
                          <td>{r.meta?.precificacao ?? ""}</td>
                          <td>{r.meta?.faixa ?? ""}</td>
                          <td>{formatMoneyBRL(r.meta?.baseCalculoVenda)}</td>
                          <td className="report-ellipsis" title={r.meta?.comprador ?? ""}>
                            {r.meta?.comprador ?? ""}
                          </td>
                          <td className="report-ellipsis" title={r.meta?.corretor ?? ""}>
                            {r.meta?.corretor ?? ""}
                          </td>
                          <td className="report-ellipsis" title={r.meta?.formaPagamento ?? ""}>
                            {r.meta?.formaPagamento ?? ""}
                          </td>
                          <td>{r.meta?.matricula ?? ""}</td>
                          <td title={formatDateTime(r.lastUpdatedAt)}>{new Date(r.lastUpdatedAt).toLocaleDateString("pt-BR")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="report-pagination">
                <button type="button" className="em-btn em-cancel" disabled={pagedRooms.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </button>
                <div className="sb-count">
                  Página {pagedRooms.page} de {pagedRooms.maxPage}
                </div>
                <button type="button" className="em-btn em-cancel" disabled={pagedRooms.page >= pagedRooms.maxPage} onClick={() => setPage((p) => Math.min(pagedRooms.maxPage, p + 1))}>
                  Próxima
                </button>
              </div>
            </div>

            <div className="report-panel">
              <div className="report-panel-head">Últimas mudanças (status da planilha)</div>
              <div className="report-recent-changes">
                {recentChanges.length === 0 ? (
                  <div className="sb-count">Sem mudanças ainda.</div>
                ) : (
                  recentChanges.map((c, idx) => {
                    return (
                      <div key={`rc-${c.at}-${c.roomId}-${idx}`} className="report-change-row">
                        <div className="report-change-left">
                          <div className="report-change-id">
                            #{c.roomId} <span className="report-change-floor">Andar {c.floor}</span>
                          </div>
                          <div className="report-change-meta">{new Date(c.at).toLocaleString("pt-BR")}</div>
                        </div>
                        <div className="report-change-right">
                          <span className="report-change-pill" style={{ borderColor: colorForStatusSala(c.from), color: colorForStatusSala(c.from) }}>
                            {c.from}
                          </span>
                          <span className="report-change-arrow">→</span>
                          <span className="report-change-pill" style={{ borderColor: colorForStatusSala(c.to), color: colorForStatusSala(c.to) }}>
                            {c.to}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      <MinimalUiToggle />
    </>
  );
}

