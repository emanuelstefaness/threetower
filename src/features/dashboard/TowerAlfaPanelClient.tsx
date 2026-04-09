"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchBuildingState } from "@/features/building/apiClient";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { formatMoneyBRL } from "@/lib/formatMoney";
import { colorForStatusSala, isReservaStatusSalaForInbox } from "@/lib/treeTowerStatusSala";

type PanelState = Awaited<ReturnType<typeof fetchBuildingState>> | null;

function DonutPaths({ segments }: { segments: Array<{ key: string; value: number; color: string }> }) {
  const total = segments.reduce((s, i) => s + i.value, 0);
  const cx = 110;
  const cy = 110;
  const R = 92;
  const r = 62;
  if (!total) return null;
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
        return <path key={item.key} d={d} fill={item.color} stroke="rgba(15,23,42,.55)" strokeWidth={1.5} />;
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
        // ignore in panel mode
      }
    };
    load();
    const refresh = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    const loop = window.setInterval(() => setLoopStep((s) => (s + 1) % 24), 4000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(loop);
    };
  }, []);

  const rooms = useMemo(() => Object.values(state?.snapshot.roomsById ?? {}), [state]);
  const totalRooms = rooms.length;
  const sold = rooms.filter((r) => (r.statusSala ?? r.meta?.statusSalaOriginal ?? "").toUpperCase().includes("VENDIDO"));
  const soldValue = sold.reduce((s, r) => s + (typeof r.meta?.valorVenda === "number" ? r.meta.valorVenda : typeof r.meta?.valorImovel === "number" ? r.meta.valorImovel : 0), 0);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      const k = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "Sem status").trim() || "Sem status";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, color: colorForStatusSala(name) }))
      .sort((a, b) => b.count - a.count);
  }, [rooms]);

  const floorLeaders = useMemo(() => {
    const byFloor = new Map<number, number>();
    for (const room of rooms) byFloor.set(room.floor, (byFloor.get(room.floor) ?? 0) + 1);
    return Array.from(byFloor.entries())
      .map(([floor, count]) => ({ floor, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [rooms]);

  const reserved = useMemo(
    () =>
      rooms
        .filter((r) => isReservaStatusSalaForInbox(r.statusSala ?? r.meta?.statusSalaOriginal))
        .sort((a, b) => (b.meta?.reservedAt ?? b.lastUpdatedAt) - (a.meta?.reservedAt ?? a.lastUpdatedAt))
        .slice(0, 10),
    [rooms]
  );

  return (
    <div className="panel-tv">
      <header className="panel-top">
        <BrandLogo />
        <div className="panel-clock">{clock.toLocaleTimeString("pt-BR")}</div>
        <AuthLogoutButton />
      </header>

      <main className="panel-grid">
        <section className="panel-card panel-kpis">
          <div className="panel-title">Resumo Executivo</div>
          <div className="panel-kpi-row">
            <article>
              <div className="kpi-label">Salas totais</div>
              <div className="kpi-value">{totalRooms}</div>
            </article>
            <article>
              <div className="kpi-label">Vendidas</div>
              <div className="kpi-value">{sold.length}</div>
            </article>
            <article>
              <div className="kpi-label">Faturamento</div>
              <div className="kpi-money">{formatMoneyBRL(soldValue)}</div>
            </article>
          </div>
        </section>

        <section className="panel-card panel-status">
          <div className="panel-title">Status (loop dinâmico)</div>
          <div className="status-grid-tv">
            {statusBreakdown.slice(0, 10).map((s, idx) => (
              <div
                key={s.name}
                className={`status-pill-tv ${loopStep % 10 === idx ? "on" : ""}`}
                style={{ borderLeft: `4px solid ${s.color}`, animationDelay: `${idx * 120}ms` }}
              >
                <span>{s.name}</span>
                <strong>{s.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-card panel-donut">
          <div className="panel-title">Distribuição Geral</div>
          <div className="donut-stage-tv">
            <svg viewBox="0 0 220 220" aria-label="Distribuição por status">
              <DonutPaths segments={statusBreakdown.map((x) => ({ key: x.name, value: x.count, color: x.color }))} />
            </svg>
          </div>
          <div className="donut-total-tv">{totalRooms} salas</div>
        </section>

        <section className="panel-card panel-floors">
          <div className="panel-title">Andares com mais salas</div>
          <div className="floor-bars-tv">
            {floorLeaders.map((f, idx) => (
              <div key={f.floor} className="floor-line-tv">
                <span>Andar {f.floor}</span>
                <div className="bar-wrap">
                  <div className="bar" style={{ width: `${(f.count / Math.max(1, floorLeaders[0]?.count ?? 1)) * 100}%`, animationDelay: `${idx * 140}ms` }} />
                </div>
                <strong>{f.count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-card panel-reservas">
          <div className="panel-title">Reservas recentes</div>
          <div className="reservas-tv">
            {reserved.length === 0 ? <div className="empty">Nenhuma reserva no momento.</div> : null}
            {reserved.map((r) => (
              <Link key={r.id} href={`/rooms?floor=${r.floor}&room=${r.id}`} className="res-row-tv">
                <span>Sala {r.id} · Andar {r.floor}</span>
                <b>{formatMoneyBRL(r.meta?.valorImovel)}</b>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <style jsx>{`
        .panel-tv { min-height: 100vh; background: radial-gradient(circle at 18% 12%, rgba(56,189,248,.16), transparent 40%), #060b16; color: #e2e8f0; padding: 14px; }
        .panel-top { display:flex; align-items:center; gap:14px; border:1px solid rgba(148,163,184,.18); border-radius:14px; padding:12px 16px; background: rgba(15,23,42,.55); }
        .panel-clock { margin-left:auto; font:600 22px "Syne",sans-serif; letter-spacing:.04em; color:#f8fafc; }
        .panel-grid { margin-top:14px; display:grid; grid-template-columns: 1.2fr 1.2fr 1fr; gap:12px; }
        .panel-card { border:1px solid rgba(148,163,184,.2); border-radius:14px; background: rgba(15,23,42,.58); padding:14px; backdrop-filter: blur(4px); }
        .panel-title { font:700 15px "Syne",sans-serif; margin-bottom:10px; color:#f8fafc; letter-spacing:.02em; }
        .panel-kpis { grid-column: 1 / span 2; }
        .panel-kpi-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .panel-kpi-row article { border:1px solid rgba(148,163,184,.2); border-radius:12px; padding:10px; background: rgba(255,255,255,.02); }
        .kpi-label { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:.07em; }
        .kpi-value { font:800 34px "Syne",sans-serif; color:#f8fafc; line-height:1.1; margin-top:4px; }
        .kpi-money { font:800 28px "Syne",sans-serif; color:#f8fafc; line-height:1.1; margin-top:6px; }
        .status-grid-tv { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:8px; }
        .status-pill-tv { display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid rgba(148,163,184,.25); border-radius:10px; padding:8px 10px; animation: panelPulse 2.8s ease-in-out infinite; background: rgba(255,255,255,.02); }
        .status-pill-tv span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; color:#cbd5e1; }
        .status-pill-tv strong { font:800 24px "Syne",sans-serif; color:#f8fafc; }
        .status-pill-tv.on { box-shadow: 0 0 0 1px rgba(56,189,248,.5), 0 0 28px rgba(56,189,248,.18); transform: translateY(-1px); }
        .donut-stage-tv { display:flex; justify-content:center; padding-top:8px; animation: rotateSlow 42s linear infinite; }
        .donut-stage-tv svg { width: 280px; height: 280px; }
        .donut-total-tv { text-align:center; font:700 20px "Syne",sans-serif; margin-top:6px; color:#f8fafc; }
        .floor-bars-tv { display:flex; flex-direction:column; gap:8px; }
        .floor-line-tv { display:grid; grid-template-columns: 90px 1fr 36px; align-items:center; gap:8px; font-size:12px; color:#cbd5e1; }
        .bar-wrap { height:8px; border-radius:999px; background: rgba(148,163,184,.18); overflow:hidden; }
        .bar { height:100%; background: linear-gradient(90deg, #22d3ee, #6366f1); animation: barGrow 1s ease both; }
        .panel-reservas { grid-column: 2 / span 2; }
        .reservas-tv { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:8px; }
        .res-row-tv { border:1px solid rgba(148,163,184,.25); border-radius:10px; padding:10px; color:#e2e8f0; text-decoration:none; display:flex; justify-content:space-between; gap:8px; background: rgba(255,255,255,.02); }
        .res-row-tv:hover { border-color: rgba(56,189,248,.5); background: rgba(56,189,248,.08); }
        .res-row-tv span { font-size:12px; }
        .res-row-tv b { font:700 13px "IBM Plex Mono",monospace; color:#fcd34d; }
        .empty { grid-column: 1 / -1; color:#94a3b8; font-size:13px; }
        @keyframes rotateSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes panelPulse { 0%,100% { opacity:.9; } 50% { opacity:1; } }
        @keyframes barGrow { from { width:0; } to { } }
        @media (max-width: 1200px) {
          .panel-grid { grid-template-columns:1fr; }
          .panel-kpis, .panel-reservas { grid-column: auto; }
          .reservas-tv { grid-template-columns:1fr; }
        }
      `}</style>
    </div>
  );
}
