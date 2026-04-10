"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchBuildingState } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import RoomFloorWorkbench from "@/features/dashboard/RoomFloorWorkbench";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { MinimalUiToggle } from "@/features/ui/MinimalUiToggle";
import { canAccessInbox, canAccessReports, canAccessTvPanel } from "@/lib/authUi";
import { colorForStatusSala } from "@/lib/treeTowerStatusSala";

function formatClock(d: Date) {
  return d.toLocaleTimeString("pt-BR");
}

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
            opacity={0.72}
            stroke="rgba(15, 23, 42, 0.45)"
            strokeWidth={1.5}
          />
        );

        angle += sw;
        return el;
      })}
    </>
  );
}

export default function TowerAlfaDashboardClient() {
  const { building, appMode, authRole, authEnabled, authLogin, setBuilding, applyEvent, setRealtime } =
    useBuildingStoreClient();
  const pathname = usePathname();
  const [clock, setClock] = useState(() => new Date());
  const [toast, setToast] = useState<{ msg: string; icon: string } | null>(null);
  const [floorPlanFloor, setFloorPlanFloor] = useState<number | null>(null);

  const showToast = (msg: string, icon = "✅") => {
    setToast({ msg, icon });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 3000);
  };

  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode: mode, authEnabled, authRole, authName, authLogin: al }) =>
        alive && setBuilding(snapshot, mode, authEnabled, authRole, authName, al)
      )
      .catch((e) => alive && setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" }));
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

  const totalAllRooms = Object.keys(building?.roomsById ?? {}).length;
  const statusSalaBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of Object.values(building?.roomsById ?? {})) {
      const key = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, color: colorForStatusSala(name) }))
      .sort((a, b) => b.count - a.count);
  }, [building]);
  const statusSalaDonutSegments = useMemo(
    () =>
      statusSalaBreakdown
        .filter((item) => item.count > 0)
        .map((item) => ({ key: item.name, value: item.count, color: item.color })),
    [statusSalaBreakdown]
  );

  const floorsSorted = useMemo(() => {
    if (!building?.floorAggregates) return [];
    return Object.keys(building.floorAggregates).map(Number).sort((a, b) => b - a);
  }, [building]);

  const statusSalaCountsForFloor = (floor: number) => {
    const map = new Map<string, number>();
    const floorIds = building?.floors?.[floor] ?? [];
    for (const roomId of floorIds) {
      const room = building?.roomsById?.[roomId];
      if (!room) continue;
      const key = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };

  const closeFloorPlan = () => setFloorPlanFloor(null);

  return (
    <>
      <div className="dashboard-page">
      <header className="topbar">
        <BrandLogo />
        {appMode === "view" ? (
          <div className="app-mode-pill" title="Edição desativada no servidor">
            Somente leitura
          </div>
        ) : null}
        <AuthLogoutButton />
        <div className="top-spacer" />
        <div className="clock">{formatClock(clock)}</div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sb-header">Painel</div>
          <div className="sb-nav">
            <Link href="/" className={`sb-item ${pathname === "/" ? "active" : ""}`}>Dashboard</Link>
            <Link href="/rooms" className={`sb-item ${pathname.startsWith("/rooms") ? "active" : ""}`}>Salas</Link>
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
            {canAccessReports(authRole) ? (
              <Link href="/reports" className={`sb-item ${pathname.startsWith("/reports") ? "active" : ""}`}>
                Relatórios
              </Link>
            ) : null}
          </div>
          <div className="sb-divider" />
          <div className="sb-section">Resumo</div>
          <div className="sb-manage">
            <div className="sb-count">{totalAllRooms} salas</div>
            {statusSalaBreakdown.map((item) => (
              <div key={`sum-${item.name}`} className="bd-row">
                <div className="report-kpi-label" style={{ minWidth: 0, flex: "0 0 140px" }}>
                  <span className="report-status-dot" style={{ background: item.color }} />
                  <span style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{item.name}</span>
                </div>
                <div className="bd-bar">
                  <div className="bd-seg" style={{ width: `${totalAllRooms ? (item.count / totalAllRooms) * 100 : 0}%`, background: item.color }} />
                </div>
                <div className="bd-total">{item.count}</div>
              </div>
            ))}
          </div>
        </aside>

        <main className="main dashboard-main">
          <div>
            <div className="main-title">Visão Geral — 16 Andares</div>
            <div className="main-sub">
              {appMode === "view"
                ? "Visualização: clique num andar para ver a planta e os dados das salas (sem alterações)."
                : "Clique num andar para gerir a planta: criar, editar ou excluir salas sem sair do dashboard."}
            </div>
          </div>

          <div className="legend">
            {statusSalaBreakdown.slice(0, 8).map((item) => (
              <div key={`leg-${item.name}`} className="leg-item">
                <div className="leg-dot" style={{ background: item.color }} />
                {item.name}
              </div>
            ))}
          </div>

          <div className="floors-wrap">
            <div className="floors-head">
              <span>Andar</span><span /><span>Distribuição (status da planilha)</span><span style={{ textAlign: "right" }}>Total</span>
            </div>
            {floorsSorted.map((f) => {
              const statusSalaCounts = statusSalaCountsForFloor(f);
              const tot = Array.from(statusSalaCounts.values()).reduce((s, v) => s + v, 0) || 1;
              const segments = statusSalaBreakdown
                .map((item) => ({ ...item, floorCount: statusSalaCounts.get(item.name) ?? 0 }))
                .filter((item) => item.floorCount > 0);
              return (
                <div
                  key={`floor-${f}`}
                  className={`floor-row${floorPlanFloor === f ? " active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFloorPlanFloor(f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFloorPlanFloor(f);
                    }
                  }}
                >
                  <div className="fl-label">Andar</div>
                  <div className="fl-num">{f}</div>
                  <div className="fl-bar">
                    {segments.map((item) => (
                      <div key={`seg-${f}-${item.name}`} className="fl-seg" style={{ width: `${(item.floorCount / tot) * 100}%`, background: item.color }} />
                    ))}
                  </div>
                  <div className="fl-pcts">
                    <span className="fl-pct">{tot}</span>
                  </div>
                </div>
              );
            })}
          </div>

        </main>

        <aside className="right">
          <div className="rp-header">
            🏗️ Prédio Inteiro
            <span className="rp-sub">{totalAllRooms} salas</span>
          </div>
          <div className="status-cards">
            {statusSalaBreakdown.map((item) => (
              <div
                key={`sc-${item.name}`}
                className="status-card"
                style={{ borderLeft: `3px solid ${item.color}` }}
                title={item.name}
              >
                <div className="status-card-top">
                  <span className="status-card-dot" style={{ background: item.color }} />
                  <div className="status-card-name">{item.name}</div>
                </div>
                <div className="status-card-num">{item.count}</div>
              </div>
            ))}
          </div>
          <div className="donut-wrap">
            <svg className="donut-svg" viewBox="0 0 148 148" aria-label="Donut de distribuição">
              <DonutPaths segments={statusSalaDonutSegments} />
            </svg>
            <div className="donut-center">
              <div className="donut-total">{totalAllRooms}</div>
              <div className="donut-label">salas totais</div>
            </div>
          </div>
        </aside>
      </div>
      </div>

      {floorPlanFloor != null && (
        <div
          className="edit-overlay open floorplan-dash-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Planta do andar ${floorPlanFloor}`}
          onClick={(e) => e.target === e.currentTarget && closeFloorPlan()}
        >
          <div className="floorplan-dash-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="floorplan-dash-close" onClick={closeFloorPlan} aria-label="Fechar planta">
              ×
            </button>
            <div className="floorplan-dash-modal-body">
              <RoomFloorWorkbench floor={floorPlanFloor} showRoomGrid={false} nestedInFloorModal subCaption="" />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast show" role="status" aria-live="polite">
          <span className="toast-ico">{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <MinimalUiToggle />
    </>
  );
}

