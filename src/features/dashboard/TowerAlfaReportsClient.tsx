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
import { canAccessInbox, canAccessReports, canAccessTvPanel } from "@/lib/authUi";
import { formatDecimalBRL, formatMoneyBRL } from "@/lib/formatMoney";
import {
  colorForStatusSala,
  normalizeStatusSala,
  TREE_TOWER_STATUS_SALA_OPTIONS,
} from "@/lib/treeTowerStatusSala";
import { bucketAreaTipologia40vs140 } from "@/lib/vendasMensaisAgg";

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
  const { building, appMode, authRole, authEnabled, authLogin, applyEvent, setBuilding, setRealtime } =
    useBuildingStoreClient();

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

  /** Comparação vendido × outro status: R$/m² (vendido) fixo vs R$/m² tabela do status escolhido. */
  const [compareWithStatus, setCompareWithStatus] = useState<string>(() => "ESTOQUE");

  // Snapshot inicial
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
        .then(({ snapshot, appMode: mode, authEnabled, authRole: r, authName, authLogin: al }) =>
          setBuilding(snapshot, mode, authEnabled, r, authName, al)
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

  /** Base da comparação: ignora o filtro lateral "Status da sala". */
  const compareBaseRooms = useMemo(() => {
    if (!building) return [];

    const q = search.trim().toLowerCase();
    const now = Date.now();
    const maxAge = recentOnly ? startOfDay(now) - recentDays * 24 * 60 * 60 * 1000 : null;

    let rooms = Object.values(building.roomsById);

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
  }, [building, floorFilter, areaMin, areaMax, search, recentOnly, recentDays, sortBy]);

  // Reset de pagina quando filtros mudam
  useEffect(() => {
    setPage(1);
  }, [statusSalaFilter, floorFilter, areaMin, areaMax, search, recentOnly, recentDays, sortBy]);

  const totalArea = useMemo(() => {
    return filteredRooms.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
  }, [filteredRooms]);

  /** Salas ESTOQUE no filtro: contagem e soma de m² (área total disponível). */
  const estoqueStats = useMemo(() => {
    const estoque = filteredRooms.filter(
      (r) => normalizeStatusSala(r.statusSala ?? r.meta?.statusSalaOriginal) === "ESTOQUE",
    );
    const areaTotal = estoque.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
    return { count: estoque.length, areaTotal };
  }, [filteredRooms]);

  const statusSalaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of Object.values(building?.roomsById ?? {})) {
      const s = (r.statusSala ?? r.meta?.statusSalaOriginal)?.trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [building]);

  const compareStatusPillOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of statusSalaOptions) set.add(s);
    for (const s of TREE_TOWER_STATUS_SALA_OPTIONS) set.add(s);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [statusSalaOptions]);

  const totalValorImovel = useMemo(() => {
    return filteredRooms.reduce((s, r) => s + valorImovelMeta(r), 0);
  }, [filteredRooms]);

  /** Valor médio R$/m² de tabela no filtro: Σ valor imóvel ÷ Σ m². */
  const mediaValorM2Tabela = useMemo(() => {
    if (totalArea <= 0) return 0;
    return totalValorImovel / totalArea;
  }, [totalArea, totalValorImovel]);

  const vendidas = useMemo(() => {
    const sold = compareBaseRooms.filter((r) => normalizeStatusSala(r.statusSala ?? r.meta?.statusSalaOriginal) === "VENDIDO");
    const valorVendas = sold.reduce((s, r) => s + valorImovelMeta(r), 0);
    const valorVendido = sold.reduce((s, r) => s + valorFaturamentoVenda(r), 0);
    const descontoTotal = valorVendas - valorVendido;
    const areaTotal = sold.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
    return {
      count: sold.length,
      valorVendas,
      valorVendido,
      descontoTotal,
      areaTotal,
      ticketMedio: sold.length ? valorVendido / sold.length : 0,
      /** Ponderado pelo total de m²: valor vendido ÷ área vendida. */
      valorMedioM2: areaTotal > 0 ? valorVendido / areaTotal : 0,
    };
  }, [compareBaseRooms]);

  const compareOtherRooms = useMemo(() => {
    const n = normalizeStatusSala(compareWithStatus);
    return compareBaseRooms.filter((r) => normalizeStatusSala(r.statusSala ?? r.meta?.statusSalaOriginal) === n);
  }, [compareBaseRooms, compareWithStatus]);

  const compareOtherArea = useMemo(() => {
    return compareOtherRooms.reduce((s, r) => s + (Number.isFinite(r.area) ? r.area : 0), 0);
  }, [compareOtherRooms]);

  const compareOtherValorImovel = useMemo(() => {
    return compareOtherRooms.reduce((s, r) => s + valorImovelMeta(r), 0);
  }, [compareOtherRooms]);

  /** R$/m² de tabela (Σ valor imóvel ÷ Σ m²) só nas salas do status escolhido. */
  const compareOtherMediaM2Tabela = useMemo(() => {
    if (compareOtherArea <= 0) return 0;
    return compareOtherValorImovel / compareOtherArea;
  }, [compareOtherArea, compareOtherValorImovel]);

  const compareWithStatusLabel = useMemo(() => {
    const n = normalizeStatusSala(compareWithStatus);
    for (const label of compareStatusPillOptions) {
      if (normalizeStatusSala(label) === n) return label;
    }
    return compareWithStatus;
  }, [compareStatusPillOptions, compareWithStatus]);

  const statusSalaBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; n40: number; n140: number }>();
    for (const room of filteredRooms) {
      const key = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
      const cur = map.get(key) ?? { count: 0, n40: 0, n140: 0 };
      cur.count += 1;
      const b = bucketAreaTipologia40vs140(room.area);
      if (b === "40") cur.n40 += 1;
      else if (b === "140") cur.n140 += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        count: v.count,
        n40: v.n40,
        n140: v.n140,
        soma40e140: v.n40 + v.n140,
        color: colorForStatusSala(name),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRooms]);
  const statusSalaDonutSegments = useMemo(
    () =>
      statusSalaBreakdown
        .filter((item) => item.count > 0)
        .map((item) => ({ key: item.name, value: item.count, color: item.color })),
    [statusSalaBreakdown]
  );

  const statusSalaDetailFooter = useMemo(() => {
    return statusSalaBreakdown.reduce(
      (acc, item) => ({
        n40: acc.n40 + item.n40,
        n140: acc.n140 + item.n140,
        soma: acc.soma + item.soma40e140,
      }),
      { n40: 0, n140: 0, soma: 0 },
    );
  }, [statusSalaBreakdown]);

  const floorsSorted = useMemo(() => {
    if (!building) return [];
    return Object.keys(building.floorAggregates)
      .map((k) => Number(k))
      .sort((a, b) => b - a);
  }, [building]);

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
        "status_sala",
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
        "data_venda_iso",
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
        r.meta?.dataVenda != null && Number.isFinite(r.meta.dataVenda) && r.meta.dataVenda > 0
          ? new Date(r.meta.dataVenda).toISOString()
          : "",
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
          <div className="sb-section">Filtros</div>

          <div className="sb-manage reports-sb-manage">
            <div className="em-field">
              <div className="em-label">Status da sala</div>
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
                  setCompareWithStatus("ESTOQUE");
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
                <div className="report-kpi-card-label">Área total disponível</div>
                <div className="report-kpi-card-value">{Math.round(estoqueStats.areaTotal * 10) / 10}</div>
                <div className="report-kpi-card-sub">
                  m² em ESTOQUE · {estoqueStats.count} sala{estoqueStats.count !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="report-kpi-card">
                <div className="report-kpi-card-label">Faturamento (vendas)</div>
                <div className="report-kpi-card-value">{formatMoneyBRL(vendidas.valorVendido) || "—"}</div>
                <div className="report-kpi-card-sub">
                  {vendidas.count} unidade{vendidas.count !== 1 ? "s" : ""} · Ticket méd. {formatMoneyBRL(vendidas.ticketMedio) || "—"}
                </div>
              </div>
            </div>

            <div className="report-compare-card">
              <div className="report-compare-head">Comparação · vendido × outro status</div>
              <div className="report-compare-toolbar">
                <div className="report-compare-field report-compare-field--narrow">
                  <label className="report-compare-field-label" htmlFor="report-compare-with">
                    Comparar vendido com
                  </label>
                  <select
                    id="report-compare-with"
                    className="em-select"
                    value={normalizeStatusSala(compareWithStatus)}
                    onChange={(e) => setCompareWithStatus(e.target.value)}
                  >
                    {compareStatusPillOptions.map((label) => {
                      const v = normalizeStatusSala(label);
                      return (
                        <option key={`cw-${label}`} value={v}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="report-compare-grid report-compare-grid--two">
                <div className="report-compare-item">
                  <div className="report-compare-label">R$/m² médio ({compareWithStatusLabel})</div>
                  <div className="report-compare-value">
                    {compareOtherArea > 0 ? formatMoneyBRL(compareOtherMediaM2Tabela) : "—"}
                  </div>
                  <div className="report-compare-hint">
                    Σ valor imóvel ÷ Σ m² (tabela) · {compareOtherRooms.length} sala{compareOtherRooms.length !== 1 ? "s" : ""} ·{" "}
                    {Math.round(compareOtherArea * 10) / 10} m²
                  </div>
                </div>
                <div className="report-compare-item report-compare-item--fixed">
                  <div className="report-compare-label">R$/m² médio (vendido)</div>
                  <div className="report-compare-value">
                    {vendidas.areaTotal > 0 ? formatMoneyBRL(vendidas.valorMedioM2) : "—"}
                  </div>
                  <div className="report-compare-hint">
                    Valor vendido ÷ m² · VENDIDO · {vendidas.count} sala{vendidas.count !== 1 ? "s" : ""} ·{" "}
                    {Math.round(vendidas.areaTotal * 10) / 10} m²
                  </div>
                </div>
              </div>
            </div>

            <div className="report-grid-2">
              <div className="report-panel">
                <div className="report-panel-head">Vendas (status VENDIDO no filtro)</div>
                <div className="report-kpi-list">
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Quantidade de vendas</div>
                    <div className="report-kpi-value">{vendidas.count}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Valor de vendas</div>
                    <div className="report-kpi-value">{formatMoneyBRL(vendidas.valorVendas) || "—"}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Valor vendido</div>
                    <div className="report-kpi-value">{formatMoneyBRL(vendidas.valorVendido) || "—"}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">{vendidas.descontoTotal >= 0 ? "Desconto total" : "Acréscimo total"}</div>
                    <div className="report-kpi-value">{formatMoneyBRL(Math.abs(vendidas.descontoTotal)) || "—"}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Área total de vendas (m²)</div>
                    <div className="report-kpi-value">{Math.round(vendidas.areaTotal * 10) / 10}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Média R$/m² vendido</div>
                    <div className="report-kpi-value">
                      {vendidas.areaTotal > 0 ? formatMoneyBRL(vendidas.valorMedioM2) : "—"}
                    </div>
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
                    <div className="report-kpi-label">Área total (m²)</div>
                    <div className="report-kpi-value">{Math.round(totalArea * 10) / 10}</div>
                  </div>
                  <div className="report-kpi-row">
                    <div className="report-kpi-label">Média R$/m² (tabela)</div>
                    <div className="report-kpi-value">
                      {totalArea > 0 ? formatMoneyBRL(mediaValorM2Tabela) : "—"}
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

              <div className="report-panel report-panel--detail-table">
                <div className="report-panel-head">Distribuição detalhada</div>
                <div className="report-detail-table-wrap">
                  <table className="report-detail-table" aria-label="Distribuição por status e tipologia de área">
                    <thead>
                      <tr>
                        <th scope="col">Status</th>
                        <th scope="col" className="report-detail-th-num">
                          <abbr title="Área privativa inferior a 100 m² (tipologia ~40 m²)">40 m²</abbr>
                        </th>
                        <th scope="col" className="report-detail-th-num">
                          <abbr title="Área privativa a partir de 100 m² (~140 m², esquinas)">140 m²</abbr>
                        </th>
                        <th scope="col" className="report-detail-th-num">
                          <abbr title="Soma das colunas 40 m² e 140 m²">Σ</abbr>
                        </th>
                        <th scope="col" className="report-detail-th-num report-detail-th-total">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusSalaBreakdown.map((item) => {
                        const pct = filteredRooms.length ? Math.round((item.count / filteredRooms.length) * 100) : 0;
                        return (
                          <tr key={`rk-${item.name}`}>
                            <th scope="row" className="report-detail-td-status">
                              <span className="report-detail-status-cell">
                                <span className="report-status-dot" style={{ background: item.color }} aria-hidden />
                                <span className="report-ellipsis" title={item.name}>
                                  {item.name}
                                </span>
                              </span>
                            </th>
                            <td className="report-detail-td-num">{item.n40}</td>
                            <td className="report-detail-td-num">{item.n140}</td>
                            <td className="report-detail-td-num report-detail-td-num--emph">{item.soma40e140}</td>
                            <td className="report-detail-td-total">
                              <span className="report-detail-total-n">{item.count}</span>
                              <span className="report-detail-total-pct">{pct}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {statusSalaBreakdown.length > 0 ? (
                      <tfoot>
                        <tr>
                          <th scope="row">Total</th>
                          <td className="report-detail-td-num">{statusSalaDetailFooter.n40}</td>
                          <td className="report-detail-td-num">{statusSalaDetailFooter.n140}</td>
                          <td className="report-detail-td-num report-detail-td-num--emph">{statusSalaDetailFooter.soma}</td>
                          <td className="report-detail-td-total">
                            <span className="report-detail-total-n">{filteredRooms.length}</span>
                            <span className="report-detail-total-pct">100%</span>
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>
            </div>

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
                      <th>Status da sala</th>
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
              <div className="report-panel-head">Últimas mudanças (STATUS SALA)</div>
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

