"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomRecord } from "@/lib/buildingTypes";
import { fetchBuildingState } from "@/features/building/apiClient";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { formatMoneyBRL } from "@/lib/formatMoney";
import { colorForStatusSala, normalizeStatusSala } from "@/lib/treeTowerStatusSala";

type PanelState = Awaited<ReturnType<typeof fetchBuildingState>> | null;

function DonutPaths({ segments }: { segments: Array<{ key: string; value: number; color: string }> }) {
  const total = segments.reduce((s, i) => s + i.value, 0);
  if (!total) return null;
  const cx = 74;
  const cy = 74;
  const R = 62;
  const r = 42;
  let angle = -Math.PI / 2;
  return (
    <>
      {segments.map((item) => {
        const sw = (item.value / total) * Math.PI * 2;
        const x1 = cx + R * Math.cos(angle);
        const y1 = cy + R * Math.sin(angle);
        const x2 = cx + R * Math.cos(angle + sw);
        const y2 = cy + R * Math.sin(angle + sw);
        const xi1 = cx + r * Math.cos(angle);
        const yi1 = cy + r * Math.sin(angle);
        const xi2 = cx + r * Math.cos(angle + sw);
        const yi2 = cy + r * Math.sin(angle + sw);
        const lg = sw > Math.PI ? 1 : 0;
        const d = `M${x1},${y1} A${R},${R},0,${lg},1,${x2},${y2} L${xi2},${yi2} A${r},${r},0,${lg},0,${xi1},${yi1} Z`;
        angle += sw;
        return <path key={item.key} d={d} fill={item.color} stroke="rgba(15,23,42,0.5)" strokeWidth={1.4} className="donut-seg" />;
      })}
    </>
  );
}

function statusLabelForRoom(r: RoomRecord): string {
  return (r.statusSala ?? r.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
}

/** Igual aos Relatórios: só STATUS SALA normalizado === "VENDIDO" (não usa .includes, para não contar ex. "PRÉ-VENDIDO"). */
function isVendidoRoom(r: RoomRecord): boolean {
  return normalizeStatusSala(r.statusSala ?? r.meta?.statusSalaOriginal) === "VENDIDO";
}

export default function TowerAlfaPanelClient() {
  const [state, setState] = useState<PanelState>(null);
  const [clock, setClock] = useState(() => new Date());
  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  const [chartPulse, setChartPulse] = useState(0);
  const activeFloorRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await fetchBuildingState();
        if (alive) setState(next);
      } catch {
        // ignorar
      }
    };
    load();
    const refresh = window.setInterval(load, 25000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const tClock = window.setInterval(() => setClock(new Date()), 1000);
    const tPulse = window.setInterval(() => setChartPulse((p) => p + 1), 5000);
    return () => {
      window.clearInterval(tClock);
      window.clearInterval(tPulse);
    };
  }, []);

  const rooms = useMemo(() => Object.values(state?.snapshot.roomsById ?? {}), [state]);
  const totalRooms = rooms.length;

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      const key = statusLabelForRoom(room);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, color: colorForStatusSala(name) }))
      .sort((a, b) => b.count - a.count);
  }, [rooms]);

  const floorsSorted = useMemo(
    () => Object.keys(state?.snapshot.floors ?? {}).map(Number).sort((a, b) => b - a),
    [state]
  );

  useEffect(() => {
    if (floorsSorted.length === 0) return;
    setActiveFloorIdx((i) => Math.min(i, floorsSorted.length - 1));
  }, [floorsSorted.length]);

  useEffect(() => {
    if (floorsSorted.length === 0) return;
    const t = window.setInterval(() => {
      setActiveFloorIdx((i) => (i + 1) % floorsSorted.length);
    }, 8000);
    return () => window.clearInterval(t);
  }, [floorsSorted.length]);

  useEffect(() => {
    const el = activeFloorRowRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  }, [activeFloorIdx]);

  const activeFloor = floorsSorted[activeFloorIdx] ?? null;

  const floorRows = useMemo(() => {
    return floorsSorted.map((floor) => {
      const ids = state?.snapshot.floors[floor] ?? [];
      const statusSalaCounts = new Map<string, number>();
      for (const id of ids) {
        const room = state?.snapshot.roomsById[id];
        if (!room) continue;
        const key = statusLabelForRoom(room);
        statusSalaCounts.set(key, (statusSalaCounts.get(key) ?? 0) + 1);
      }
      const tot = Array.from(statusSalaCounts.values()).reduce((s, v) => s + v, 0) || 1;
      const segments = statusBreakdown
        .map((item) => ({ ...item, floorCount: statusSalaCounts.get(item.name) ?? 0 }))
        .filter((item) => item.floorCount > 0);
      return { floor, total: ids.length, tot, segments };
    });
  }, [floorsSorted, state, statusBreakdown]);

  const activeFloorDetail = useMemo(() => {
    if (activeFloor == null || !state?.snapshot) return null;
    const ids = state.snapshot.floors[activeFloor] ?? [];
    const floorRooms = ids.map((id) => state.snapshot.roomsById[id]).filter(Boolean) as RoomRecord[];
    const byStatus = new Map<string, number>();
    for (const r of floorRooms) {
      const k = statusLabelForRoom(r);
      byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
    }
    const statusList = Array.from(byStatus.entries())
      .map(([name, count]) => ({ name, count, color: colorForStatusSala(name) }))
      .sort((a, b) => b.count - a.count);

    const highlights = floorRooms
      .filter((r) => isVendidoRoom(r) || Boolean(r.meta?.comprador?.trim()))
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
      .slice(0, 14);

    return { floorRooms, statusList, highlights, n: floorRooms.length };
  }, [activeFloor, state]);

  const soldRooms = useMemo(() => rooms.filter(isVendidoRoom), [rooms]);
  const soldTotal = soldRooms.length;
  const soldRevenueBase = soldRooms.reduce((sum, r) => {
    if (typeof r.meta?.valorImovel === "number" && Number.isFinite(r.meta.valorImovel)) return sum + r.meta.valorImovel;
    return sum;
  }, 0);
  const soldRevenueVendido = soldRooms.reduce((sum, r) => {
    if (typeof r.meta?.valorVenda === "number" && Number.isFinite(r.meta.valorVenda)) return sum + r.meta.valorVenda;
    return sum;
  }, 0);
  const soldDiscount = soldRevenueBase - soldRevenueVendido;

  const donutSegments = useMemo(
    () =>
      statusBreakdown
        .filter((x) => x.count > 0)
        .map((x) => ({ key: x.name, value: x.count, color: x.color })),
    [statusBreakdown]
  );

  const maxStatusCount = statusBreakdown[0]?.count ?? 1;

  const updatesFeed = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; message: string; at: number }>();
    for (const n of state?.snapshot.notifications ?? []) {
      byId.set(n.id, { id: n.id, title: n.title, message: n.message, at: n.at });
    }
    for (const r of rooms) {
      const h0 = r.history[0];
      if (!h0) continue;
      const id = `h-${r.id}-${h0.at}`;
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        title: `Sala ${r.id} · Andar ${r.floor}`,
        message: `Estado: ${h0.from === "init" ? "início" : h0.from} → ${h0.to}`,
        at: h0.at,
      });
    }
    return Array.from(byId.values())
      .sort((a, b) => b.at - a.at)
      .slice(0, 32);
  }, [state, rooms]);

  const [updIdx, setUpdIdx] = useState(0);
  useEffect(() => {
    setUpdIdx(0);
  }, [updatesFeed.length]);

  useEffect(() => {
    if (updatesFeed.length <= 1) return;
    const t = window.setInterval(() => {
      setUpdIdx((i) => (i + 1) % updatesFeed.length);
    }, 6500);
    return () => window.clearInterval(t);
  }, [updatesFeed.length]);

  const currentUpdate = updatesFeed.length > 0 ? updatesFeed[updIdx % updatesFeed.length] : null;
  const revenueLabel = formatMoneyBRL(soldRevenueVendido);
  const revenueBaseLabel = formatMoneyBRL(soldRevenueBase);

  return (
    <div className="panel-tv">
      <header className="panel-top">
        <BrandLogo />
        <div className="panel-subtitle">Modo painel contínuo</div>
        {activeFloor != null ? (
          <div className="panel-floor-pill">
            Foco automático: <strong>Andar {activeFloor}</strong>
          </div>
        ) : null}
        <div className="panel-clock">{clock.toLocaleTimeString("pt-BR")}</div>
        <AuthLogoutButton />
      </header>

      <div className="panel-body">
        <div className="panel-left">
          <section className="card floors-card">
            <div className="card-head">
              <h2>Distribuição por andar</h2>
              <span className="card-hint">Igual ao dashboard — rotação automática</span>
            </div>
            <div className="floors-wrap-tv">
              <div className="floors-head-tv">
                <span>Andar</span>
                <span />
                <span>Distribuição (status da sala)</span>
                <span className="ta-r">Total</span>
              </div>
              <div className="floors-scroll">
                {floorRows.map((row, idx) => (
                  <div
                    key={row.floor}
                    ref={idx === activeFloorIdx ? activeFloorRowRef : undefined}
                    className={`floor-row-tv ${idx === activeFloorIdx ? "active" : ""}`}
                  >
                    <div className="fl-label-tv">Andar</div>
                    <div className="fl-num-tv">{row.floor}</div>
                    <div className="fl-bar-tv">
                      {row.segments.map((seg) => (
                        <div
                          key={`${row.floor}-${seg.name}`}
                          className="fl-seg-tv"
                          style={{
                            width: `${(seg.floorCount / row.tot) * 100}%`,
                            background: seg.color,
                          }}
                          title={`${seg.name}: ${seg.floorCount}`}
                        />
                      ))}
                    </div>
                    <div className="fl-pcts-tv">
                      <span className="fl-pct-tv">{row.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="card floor-detail-card" aria-live="polite">
            <div className="card-head">
              <h2>{activeFloor != null ? `Andar ${activeFloor}` : "Andar"}</h2>
              <span className="card-hint">{activeFloorDetail ? `${activeFloorDetail.n} salas` : "—"}</span>
            </div>
            {activeFloorDetail ? (
              <>
                <div className="detail-block">
                  <h3>Por status</h3>
                  <ul className="detail-status">
                    {activeFloorDetail.statusList.map((s) => (
                      <li key={s.name}>
                        <span className="dot" style={{ background: s.color }} />
                        <span className="name">{s.name}</span>
                        <strong>{s.count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="detail-block">
                  <h3>Vendas e compradores</h3>
                  {activeFloorDetail.highlights.length === 0 ? (
                    <p className="detail-empty">Nenhuma venda ou comprador registado neste andar.</p>
                  ) : (
                    <ul className="detail-highlights">
                      {activeFloorDetail.highlights.map((r) => {
                        const ss = statusLabelForRoom(r);
                        const buyer = r.meta?.comprador?.trim();
                        return (
                          <li key={r.id}>
                            <div className="hl-top">
                              <b>Sala {r.id}</b>
                              <span className="hl-status" style={{ color: colorForStatusSala(ss) }}>
                                {ss}
                              </span>
                            </div>
                            {buyer ? <div className="hl-buyer">Comprador: {buyer}</div> : null}
                            <div className="hl-money">
                              {typeof r.meta?.valorVenda === "number" && Number.isFinite(r.meta.valorVenda)
                                ? `Venda: ${formatMoneyBRL(r.meta.valorVenda)}`
                                : `Imóvel: ${formatMoneyBRL(r.meta?.valorImovel)}`}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="detail-empty">Sem dados.</p>
            )}
          </aside>
        </div>

        <div className="panel-right">
          <section className="card kpi-row-card">
            <div className="kpi-grid">
              <article>
                <div className="kpi-lab">Salas vendidas</div>
                <div className="kpi-val">{soldTotal}</div>
              </article>
              <article className="kpi-revenue">
                <div className="kpi-lab">Valor vendido (vendidas)</div>
                <div className="kpi-mon" title={revenueLabel}>
                  {revenueLabel}
                </div>
                <div className="kpi-lab" style={{ marginTop: 4, fontSize: 10, opacity: 0.78 }}>
                  Valor de venda: {revenueBaseLabel} · {soldDiscount >= 0 ? "Desconto" : "Acréscimo"}:{" "}
                  {formatMoneyBRL(Math.abs(soldDiscount))}
                </div>
              </article>
            </div>
            <div className="kpi-foot">{totalRooms} salas no empreendimento</div>
          </section>

          <section className="card building-chart-card">
            <div className="building-chart-glow" aria-hidden />
            <div className="card-head">
              <h2>Prédio inteiro — status</h2>
              <span className="card-hint">Resumo dinâmico</span>
            </div>
            <div className="building-split">
              <div className="bar-chart-tv" key={chartPulse}>
                {statusBreakdown.map((s) => (
                  <div key={s.name} className="bc-row">
                    <span className="bc-dot" style={{ background: s.color }} title={s.name} />
                    <span className="bc-name" title={s.name}>
                      {s.name}
                    </span>
                    <div className="bc-track">
                      <div
                        className="bc-fill"
                        style={{
                          width: `${Math.max(3, (s.count / maxStatusCount) * 100)}%`,
                          background: s.color,
                        }}
                      />
                    </div>
                    <span className="bc-num">{s.count}</span>
                  </div>
                ))}
              </div>
              <div className="donut-panel-tv">
                <div className="donut-box-tv">
                  <svg className="donut-svg-tv" viewBox="0 0 148 148" aria-hidden>
                    <DonutPaths segments={donutSegments} />
                  </svg>
                  <div className="donut-cap">
                    <div className="donut-big">{totalRooms}</div>
                    <div className="donut-sub">salas totais</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card updates-card">
            <div className="card-head">
              <h2>Atualizações recentes</h2>
              {updatesFeed.length > 1 ? (
                <span className="upd-counter">
                  {updIdx + 1} / {updatesFeed.length}
                </span>
              ) : null}
            </div>
            <div className="upd-stage">
              {currentUpdate == null ? (
                <div className="upd-empty">Sem eventos recentes.</div>
              ) : (
                <article key={currentUpdate.id} className="upd-slide">
                  <time className="upd-time">
                    {new Date(currentUpdate.at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <h3 className="upd-title">{currentUpdate.title}</h3>
                  <p className="upd-msg">{currentUpdate.message}</p>
                </article>
              )}
            </div>
          </section>
        </div>
      </div>

      <style jsx>{`
        .panel-tv {
          height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(56, 189, 248, 0.12), transparent),
            linear-gradient(180deg, #0a0f1a 0%, #060912 100%);
          color: #e2e8f0;
          padding: 12px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-sizing: border-box;
        }
        .panel-top {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 16px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(15, 23, 42, 0.55);
        }
        .panel-subtitle {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #94a3b8;
        }
        .panel-floor-pill {
          font-size: 13px;
          color: #cbd5e1;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(56, 189, 248, 0.35);
          background: rgba(56, 189, 248, 0.08);
        }
        .panel-floor-pill strong {
          color: #f8fafc;
        }
        .panel-clock {
          margin-left: auto;
          font: 700 20px "Syne", sans-serif;
          color: #f8fafc;
          font-variant-numeric: tabular-nums;
        }
        .panel-body {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(300px, 380px);
          gap: 14px;
        }
        .panel-left {
          min-width: 0;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
          gap: 12px;
        }
        .panel-right {
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .card {
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.5);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
          flex-shrink: 0;
        }
        .card-head h2 {
          margin: 0;
          font: 700 15px "Syne", sans-serif;
          color: #f8fafc;
        }
        .card-hint {
          font-size: 10px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
        .floors-card {
          min-height: 0;
        }
        .floors-wrap-tv {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 12px;
          overflow: hidden;
        }
        .floors-head-tv {
          display: grid;
          grid-template-columns: 52px 22px 1fr 120px;
          gap: 10px;
          align-items: center;
          padding: 6px 14px;
          background: rgba(15, 23, 42, 0.65);
          border-bottom: 1px solid rgba(148, 163, 184, 0.15);
          font-family: "IBM Plex Mono", monospace;
          font-size: 8px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #94a3b8;
          flex-shrink: 0;
        }
        .ta-r {
          text-align: right;
        }
        .floors-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
        }
        .floor-row-tv {
          display: grid;
          grid-template-columns: 52px 22px 1fr 120px;
          gap: 10px;
          align-items: center;
          padding: 2px 14px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          background: transparent;
          transition: background 0.15s;
          position: relative;
          flex: 1 1 0;
          min-height: 0;
          scroll-margin-block: 6px;
        }
        .floor-row-tv:last-child {
          border-bottom: none;
        }
        .floor-row-tv.active {
          background: rgba(56, 189, 248, 0.08);
        }
        .floor-row-tv::after {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: transparent;
          transition: background 0.15s;
        }
        .floor-row-tv.active::after {
          background: #38bdf8;
        }
        .fl-label-tv {
          font-family: "IBM Plex Mono", monospace;
          font-size: 8px;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .fl-num-tv {
          font-family: "Syne", sans-serif;
          font-size: 14px;
          font-weight: 800;
          color: #f8fafc;
          text-align: center;
          line-height: 1;
        }
        .fl-bar-tv {
          display: flex;
          height: 16px;
          border-radius: 4px;
          overflow: hidden;
          gap: 2px;
        }
        .fl-seg-tv {
          border-radius: 3px;
          height: 100%;
          min-width: 2px;
          transition: width 0.6s ease, filter 0.3s ease;
        }
        .floor-row-tv.active .fl-seg-tv {
          filter: brightness(1.06);
        }
        .fl-pcts-tv {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }
        .fl-pct-tv {
          font-family: "IBM Plex Mono", monospace;
          font-size: 8px;
          color: #e2e8f0;
        }
        .floor-detail-card {
          overflow-y: auto;
        }
        .detail-block h3 {
          margin: 0 0 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #94a3b8;
        }
        .detail-status {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .detail-status li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          padding: 6px 8px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(148, 163, 184, 0.1);
        }
        .detail-status .dot {
          width: 8px;
          height: 8px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .detail-status .name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #e2e8f0;
        }
        .detail-status strong {
          font: 700 14px "Syne", sans-serif;
          color: #f8fafc;
        }
        .detail-highlights {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .detail-highlights li {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.15);
          background: rgba(255, 255, 255, 0.02);
        }
        .hl-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .hl-top b {
          font-size: 13px;
          color: #f8fafc;
        }
        .hl-status {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          max-width: 55%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: right;
        }
        .hl-buyer {
          font-size: 11px;
          color: #cbd5e1;
          margin-bottom: 2px;
        }
        .hl-money {
          font-size: 12px;
          font-weight: 600;
          color: #fcd34d;
          font-family: "IBM Plex Mono", monospace;
        }
        .detail-empty {
          margin: 0;
          font-size: 12px;
          color: #94a3b8;
        }
        .kpi-row-card {
          flex: 0 0 auto;
          container-type: inline-size;
          container-name: kpirow;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 10px;
        }
        .kpi-grid article {
          min-width: 0;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(255, 255, 255, 0.03);
        }
        .kpi-lab {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #94a3b8;
          margin-bottom: 6px;
        }
        .kpi-val {
          font: 800 36px "Syne", sans-serif;
          color: #f8fafc;
          line-height: 1;
        }
        .kpi-mon {
          font: 800 22px "Syne", sans-serif;
          color: #f8fafc;
          line-height: 1.1;
          word-break: break-word;
        }
        .kpi-revenue .kpi-mon {
          font-family: "IBM Plex Mono", monospace;
          font-weight: 700;
          font-size: 11px;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @supports (font-size: 1cqw) {
          .kpi-revenue .kpi-mon {
            font-size: clamp(10px, 4.6cqw, 13px);
          }
        }
        .kpi-foot {
          margin-top: 8px;
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
        }
        .building-chart-card {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .building-chart-glow {
          position: absolute;
          inset: -1px;
          border-radius: 15px;
          background: linear-gradient(125deg, rgba(56, 189, 248, 0.14), rgba(167, 139, 250, 0.1) 45%, transparent 70%);
          opacity: 0.85;
          pointer-events: none;
          z-index: 0;
        }
        .building-chart-card .card-head,
        .building-chart-card .building-split {
          position: relative;
          z-index: 1;
        }
        .building-split {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(96px, 118px);
          gap: 10px;
          align-items: stretch;
        }
        .bar-chart-tv {
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
          justify-content: space-evenly;
          padding: 2px 0;
        }
        .bc-row {
          flex: 1 1 0;
          min-height: 0;
          display: grid;
          grid-template-columns: 7px minmax(0, 0.38fr) 1fr 24px;
          gap: 4px 5px;
          align-items: center;
        }
        .bc-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.6);
        }
        .bc-name {
          font-size: 8px;
          line-height: 1.2;
          color: #cbd5e1;
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          word-break: break-word;
        }
        .bc-track {
          height: 7px;
          border-radius: 999px;
          background: rgba(30, 41, 59, 0.9);
          overflow: hidden;
          align-self: center;
        }
        .bc-fill {
          height: 100%;
          border-radius: 999px;
          animation: barSweep 4.5s ease-in-out infinite;
          transform-origin: left center;
        }
        .bc-num {
          font: 700 10px "Syne", sans-serif;
          color: #f8fafc;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .donut-panel-tv {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px 4px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(148, 163, 184, 0.14);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .donut-box-tv {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 104px;
        }
        .donut-svg-tv {
          width: 100%;
          height: auto;
          max-height: 104px;
          aspect-ratio: 1;
          animation: donutSoft 8s ease-in-out infinite;
        }
        :global(.donut-seg) {
          animation: segGlow 5s ease-in-out infinite;
        }
        .donut-cap {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .donut-big {
          font: 800 22px "Syne", sans-serif;
          color: #f8fafc;
          line-height: 1;
        }
        .donut-sub {
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: #94a3b8;
          margin-top: 3px;
          text-align: center;
          max-width: 72px;
        }
        .updates-card {
          flex: 0 0 auto;
          min-height: 0;
        }
        .upd-counter {
          font-size: 10px;
          font-family: "IBM Plex Mono", monospace;
          color: #64748b;
          font-variant-numeric: tabular-nums;
        }
        .upd-stage {
          flex: 1;
          min-height: 102px;
          display: flex;
          align-items: stretch;
        }
        .upd-slide {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(56, 189, 248, 0.22);
          background: linear-gradient(165deg, rgba(30, 58, 95, 0.35), rgba(15, 23, 42, 0.55));
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
          animation: updEnter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .upd-time {
          font-size: 10px;
          font-family: "IBM Plex Mono", monospace;
          color: #64748b;
          font-variant-numeric: tabular-nums;
        }
        .upd-title {
          margin: 0;
          font: 700 14px "Syne", sans-serif;
          color: #f8fafc;
          line-height: 1.25;
        }
        .upd-msg {
          margin: 0;
          font-size: 12px;
          line-height: 1.45;
          color: #94a3b8;
          flex: 1;
        }
        .upd-empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
          border: 1px dashed rgba(148, 163, 184, 0.2);
          border-radius: 12px;
        }
        @keyframes barSweep {
          0%,
          100% {
            opacity: 1;
            transform: scaleX(1);
          }
          50% {
            opacity: 0.92;
            transform: scaleX(0.98);
          }
        }
        @keyframes donutSoft {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.03);
          }
        }
        @keyframes segGlow {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.88;
          }
        }
        @keyframes updEnter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (max-width: 1100px) {
          .panel-body {
            grid-template-columns: 1fr;
            overflow-y: auto;
          }
          .panel-tv {
            height: auto;
            min-height: 100vh;
            overflow-y: auto;
          }
          .panel-left {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
