"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchBuildingState } from "@/features/building/apiClient";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { formatMoneyBRL } from "@/lib/formatMoney";
import { colorForStatusSala } from "@/lib/treeTowerStatusSala";

type PanelState = Awaited<ReturnType<typeof fetchBuildingState>> | null;

function DonutPaths({ segments }: { segments: Array<{ key: string; value: number; color: string }> }) {
  const total = segments.reduce((s, i) => s + i.value, 0);
  if (!total) return null;
  const cx = 90;
  const cy = 90;
  const rOuter = 78;
  const rInner = 52;
  let angle = -Math.PI / 2;
  return (
    <>
      {segments.map((item) => {
        const sweep = (item.value / total) * Math.PI * 2;
        const x1 = cx + rOuter * Math.cos(angle);
        const y1 = cy + rOuter * Math.sin(angle);
        const x2 = cx + rOuter * Math.cos(angle + sweep);
        const y2 = cy + rOuter * Math.sin(angle + sweep);
        const xi1 = cx + rInner * Math.cos(angle);
        const yi1 = cy + rInner * Math.sin(angle);
        const xi2 = cx + rInner * Math.cos(angle + sweep);
        const yi2 = cy + rInner * Math.sin(angle + sweep);
        const lg = sweep > Math.PI ? 1 : 0;
        const d = `M${x1},${y1} A${rOuter},${rOuter},0,${lg},1,${x2},${y2} L${xi2},${yi2} A${rInner},${rInner},0,${lg},0,${xi1},${yi1} Z`;
        angle += sweep;
        return <path key={item.key} d={d} fill={item.color} stroke="rgba(15,23,42,.6)" strokeWidth={1.3} />;
      })}
    </>
  );
}

export default function TowerAlfaPanelClient() {
  const [state, setState] = useState<PanelState>(null);
  const [clock, setClock] = useState(() => new Date());
  const [loopStep, setLoopStep] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await fetchBuildingState();
        if (alive) setState(next);
      } catch {
        // painel ignora erros transitórios
      }
    };
    load();
    const refresh = window.setInterval(load, 20000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const tClock = window.setInterval(() => setClock(new Date()), 1000);
    const tLoop = window.setInterval(() => setLoopStep((s) => (s + 1) % 120), 2500);
    return () => {
      window.clearInterval(tClock);
      window.clearInterval(tLoop);
    };
  }, []);

  const rooms = useMemo(() => Object.values(state?.snapshot.roomsById ?? {}), [state]);
  const totalRooms = rooms.length;

  const soldRooms = useMemo(
    () => rooms.filter((r) => ((r.statusSala ?? r.meta?.statusSalaOriginal ?? "").trim().toUpperCase() || "").includes("VENDIDO")),
    [rooms]
  );
  const soldTotal = soldRooms.length;
  const soldRevenue = soldRooms.reduce((sum, r) => {
    if (typeof r.meta?.valorVenda === "number" && Number.isFinite(r.meta.valorVenda)) return sum + r.meta.valorVenda;
    if (typeof r.meta?.valorImovel === "number" && Number.isFinite(r.meta.valorImovel)) return sum + r.meta.valorImovel;
    return sum;
  }, 0);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      const key = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, color: colorForStatusSala(name) }))
      .sort((a, b) => b.count - a.count);
  }, [rooms]);

  const floorsSorted = useMemo(() => {
    return Object.keys(state?.snapshot.floors ?? {}).map(Number).sort((a, b) => b - a);
  }, [state]);

  const floorRows = useMemo(() => {
    const base = statusBreakdown.slice(0, 6);
    return floorsSorted.map((floor) => {
      const ids = state?.snapshot.floors[floor] ?? [];
      const map = new Map<string, number>();
      for (const id of ids) {
        const room = state?.snapshot.roomsById[id];
        if (!room) continue;
        const key = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      const total = ids.length || 1;
      const segments = base
        .map((x) => ({ ...x, floorCount: map.get(x.name) ?? 0 }))
        .filter((x) => x.floorCount > 0);
      return { floor, total, segments };
    });
  }, [floorsSorted, state, statusBreakdown]);

  const recentUpdates = useMemo(() => {
    const list = [...(state?.snapshot.notifications ?? [])].sort((a, b) => b.at - a.at);
    return list.slice(0, 8);
  }, [state]);

  return (
    <div className="panel-tv">
      <header className="panel-top">
        <BrandLogo />
        <div className="panel-subtitle">Modo painel contínuo</div>
        <div className="panel-clock">{clock.toLocaleTimeString("pt-BR")}</div>
        <AuthLogoutButton />
      </header>

      <main className="panel-grid">
        <section className="box floors">
          <div className="box-title">Painel dos andares</div>
          <div className="floor-head">
            <span>Andar</span>
            <span>Distribuição</span>
            <span>Total</span>
          </div>
          <div className="floor-list">
            {floorRows.map((row, idx) => (
              <div key={row.floor} className={`floor-row ${loopStep % Math.max(1, floorRows.length) === idx ? "on" : ""}`}>
                <span className="f-label">Andar {row.floor}</span>
                <div className="f-bar">
                  {row.segments.map((seg) => (
                    <div
                      key={`${row.floor}-${seg.name}`}
                      className="f-seg"
                      style={{
                        width: `${(seg.floorCount / row.total) * 100}%`,
                        background: seg.color,
                      }}
                    />
                  ))}
                </div>
                <span className="f-total">{row.total}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="box kpis">
          <div className="box-title">Vendidas e faturamento</div>
          <div className="kpi-cards">
            <article>
              <div className="kpi-label">Salas vendidas</div>
              <div className="kpi-value">{soldTotal}</div>
            </article>
            <article>
              <div className="kpi-label">Faturamento total</div>
              <div className="kpi-money">{formatMoneyBRL(soldRevenue)}</div>
            </article>
          </div>
        </section>

        <section className="box summary">
          <div className="box-title">Resumo de quantidades por status</div>
          <div className="summary-grid">
            <div className="status-list">
              {statusBreakdown.slice(0, 8).map((s, idx) => (
                <div key={s.name} className={`status-row ${loopStep % 8 === idx ? "on" : ""}`} style={{ borderLeft: `3px solid ${s.color}` }}>
                  <span>{s.name}</span>
                  <strong>{s.count}</strong>
                </div>
              ))}
            </div>
            <div className="donut-area">
              <svg viewBox="0 0 180 180" aria-label="Donut de status">
                <DonutPaths segments={statusBreakdown.map((x) => ({ key: x.name, value: x.count, color: x.color }))} />
              </svg>
              <div className="donut-total">{totalRooms}</div>
              <div className="donut-label">salas totais</div>
            </div>
          </div>
        </section>

        <section className="box updates">
          <div className="box-title">Atualizações recentes</div>
          <div className="updates-list">
            {recentUpdates.length === 0 ? <div className="update-empty">Sem eventos recentes.</div> : null}
            {recentUpdates.map((evt, idx) => (
              <div key={evt.id} className={`update-row ${loopStep % Math.max(1, recentUpdates.length) === idx ? "on" : ""}`}>
                <div className="u-main">
                  <b>{evt.title}</b>
                  <span>{evt.message}</span>
                </div>
                <time>{new Date(evt.at).toLocaleTimeString("pt-BR")}</time>
              </div>
            ))}
          </div>
        </section>
      </main>

      <style jsx>{`
        .panel-tv {
          height: 100vh;
          overflow: hidden;
          background: radial-gradient(circle at 20% 10%, rgba(56, 189, 248, 0.16), transparent 42%), #070d1a;
          color: #e2e8f0;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .panel-top {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 14px;
          padding: 12px 16px;
          background: rgba(15, 23, 42, 0.52);
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 62px;
        }
        .panel-subtitle {
          font-size: 12px;
          color: #94a3b8;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .panel-clock {
          margin-left: auto;
          font: 700 22px "Syne", sans-serif;
          color: #f8fafc;
        }
        .panel-grid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          grid-template-rows: 0.95fr 1.05fr;
          gap: 12px;
        }
        .box {
          min-height: 0;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.58);
          padding: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .box-title {
          font: 700 15px "Syne", sans-serif;
          color: #f8fafc;
          margin-bottom: 8px;
          letter-spacing: 0.02em;
        }
        .floors {
          grid-row: 1 / span 2;
        }
        .floor-head {
          display: grid;
          grid-template-columns: 90px 1fr 44px;
          gap: 8px;
          font-size: 10px;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: #93a4bd;
          margin-bottom: 8px;
        }
        .floor-list {
          min-height: 0;
          display: grid;
          grid-template-rows: repeat(17, minmax(0, 1fr));
          gap: 6px;
        }
        .floor-row {
          display: grid;
          grid-template-columns: 90px 1fr 44px;
          gap: 8px;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 8px;
          padding: 0 8px;
          background: rgba(255, 255, 255, 0.015);
          transition: box-shadow 0.35s ease, border-color 0.35s ease;
        }
        .floor-row.on {
          border-color: rgba(56, 189, 248, 0.55);
          box-shadow: inset 0 0 20px rgba(56, 189, 248, 0.1);
        }
        .f-label {
          font-size: 11px;
          color: #cbd5e1;
        }
        .f-total {
          text-align: right;
          font: 700 13px "Syne", sans-serif;
          color: #f8fafc;
        }
        .f-bar {
          height: 16px;
          border-radius: 6px;
          background: rgba(148, 163, 184, 0.15);
          overflow: hidden;
          display: flex;
        }
        .f-seg {
          height: 100%;
          animation: segPulse 3.6s ease-in-out infinite;
        }
        .kpi-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .kpi-cards article {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 10px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.02);
        }
        .kpi-label {
          font-size: 11px;
          color: #94a3b8;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .kpi-value {
          font: 800 44px "Syne", sans-serif;
          color: #f8fafc;
          line-height: 1;
        }
        .kpi-money {
          font: 800 36px "Syne", sans-serif;
          color: #f8fafc;
          line-height: 1.05;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: 1fr 180px;
          gap: 10px;
          min-height: 0;
        }
        .status-list {
          min-height: 0;
          display: grid;
          grid-template-rows: repeat(8, minmax(0, 1fr));
          gap: 6px;
        }
        .status-row {
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 8px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: rgba(255, 255, 255, 0.02);
          transition: transform 0.35s ease, box-shadow 0.35s ease;
        }
        .status-row.on {
          transform: translateX(2px);
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.18);
        }
        .status-row span {
          font-size: 11px;
          color: #d4dcea;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .status-row strong {
          font: 700 18px "Syne", sans-serif;
          color: #f8fafc;
        }
        .donut-area {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          animation: spinLoop 30s linear infinite;
        }
        .donut-area svg {
          width: 180px;
          height: 180px;
        }
        .donut-total {
          margin-top: 6px;
          font: 800 34px "Syne", sans-serif;
          color: #f8fafc;
          line-height: 1;
        }
        .donut-label {
          font-size: 10px;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: #94a3b8;
          margin-top: 4px;
        }
        .updates-list {
          min-height: 0;
          display: grid;
          grid-template-rows: repeat(8, minmax(0, 1fr));
          gap: 6px;
        }
        .update-row {
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          padding: 6px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: rgba(255, 255, 255, 0.02);
          animation: updateSlide 6.8s ease-in-out infinite;
        }
        .update-row.on {
          border-color: rgba(56, 189, 248, 0.6);
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.16);
        }
        .u-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .u-main b {
          font-size: 12px;
          color: #f8fafc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .u-main span {
          font-size: 11px;
          color: #a7b6cc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        time {
          font-size: 11px;
          color: #93a4bd;
          font-family: "IBM Plex Mono", monospace;
        }
        .update-empty {
          border: 1px dashed rgba(148, 163, 184, 0.25);
          border-radius: 8px;
          color: #94a3b8;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @keyframes segPulse {
          0%,
          100% {
            filter: brightness(0.94);
          }
          50% {
            filter: brightness(1.08);
          }
        }
        @keyframes spinLoop {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes updateSlide {
          0%,
          100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(2px);
          }
        }
      `}</style>
    </div>
  );
}
