"use client";

import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatMoneyAxisBRL, formatMoneyBRL, formatMoneyCompactMilBRL } from "@/lib/formatMoney";
import type { BuildingSnapshot } from "@/lib/buildingTypes";
import type { TargetsMap } from "@/lib/vendasReportTargets";
import {
  formatVendaTooltipLine,
  listSalasVendidasMesTipologia,
  type VendaMesRow,
} from "@/lib/vendasMensaisAgg";

const SEGMENT_TOOLTIP_MAX_SALES = 30;

type TooltipState =
  | {
      mode: "segment";
      x: number;
      y: number;
      title: string;
      swatch: string;
      text: string;
      detailLines?: string[];
    }
  | {
      mode: "lines";
      x: number;
      y: number;
      title: string;
      lines: string[];
    }
  | null;

const C_Q_40 = "rgba(147, 51, 234, 0.92)";
const C_Q_140 = "rgba(249, 115, 22, 0.92)";
const C_META = "rgba(239, 68, 68, 0.95)";
const C_CUM_FAT = "rgba(59, 130, 246, 0.85)";
const C_CUM_Q = "rgba(147, 51, 234, 0.75)";

/** `relatedTarget` nem sempre é `Node` válido para `contains` (ex.: alguns alvos em pointer events). */
function pointerEnteredDescendant(current: Element, e: { relatedTarget: EventTarget | null }): boolean {
  const rel = e.relatedTarget;
  if (rel == null || !(rel instanceof Node)) return false;
  return current.contains(rel);
}

function splitFatByTypology(r: VendaMesRow): { fat40: number; fat140: number } {
  const u = r.n40 + r.n140;
  if (u <= 0) {
    if (r.fat > 0) return { fat40: r.fat * 0.5, fat140: r.fat * 0.5 };
    return { fat40: 0, fat140: 0 };
  }
  return { fat40: r.fat * (r.n40 / u), fat140: r.fat * (r.n140 / u) };
}

function monthMeta(targets: TargetsMap, mk: string) {
  const t = targets[mk];
  return {
    fat: typeof t?.faturamento === "number" && t.faturamento > 0 ? t.faturamento : 0,
    qtd: typeof t?.quantidade === "number" && t.quantidade > 0 ? t.quantidade : 0,
  };
}

export default function VendasPeriodDashboardCharts({
  building,
  rows,
  targets,
}: {
  building: BuildingSnapshot | null;
  rows: VendaMesRow[];
  targets: TargetsMap;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TooltipState>(null);

  const segmentTooltipLines = useMemo(() => {
    const m = new Map<string, { typ40: string[]; typ140: string[] }>();
    if (!building) return m;
    for (const row of rows) {
      const mk = row.monthKey;
      const buildLines = (typ: "40" | "140") => {
        const rooms = listSalasVendidasMesTipologia(building, mk, typ);
        const lines = rooms.slice(0, SEGMENT_TOOLTIP_MAX_SALES).map(formatVendaTooltipLine);
        if (rooms.length > SEGMENT_TOOLTIP_MAX_SALES) {
          lines.push(`… e mais ${rooms.length - SEGMENT_TOOLTIP_MAX_SALES}.`);
        }
        return lines;
      };
      m.set(mk, { typ40: buildLines("40"), typ140: buildLines("140") });
    }
    return m;
  }, [building, rows]);

  const showSegmentTip = useCallback(
    (e: ReactPointerEvent, payload: { title: string; swatch: string; text: string; detailLines?: string[] }) => {
      const el = wrapRef.current;
      if (!el) return;
      const b = el.getBoundingClientRect();
      const x = e.clientX - b.left - 12;
      let y = e.clientY - b.top;
      y = Math.min(Math.max(y, 24), Math.max(24, b.height - 32));
      setTip({ mode: "segment", x, y, ...payload });
    },
    [],
  );

  const showLinesTip = useCallback((e: ReactPointerEvent, title: string, lines: string[]) => {
    const el = wrapRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    let x = e.clientX - b.left + 14;
    let y = e.clientY - b.top - 10;
    const tipMaxW = 292;
    const tipMaxH = 120;
    x = Math.min(Math.max(x, 6), Math.max(6, b.width - tipMaxW));
    y = Math.min(Math.max(y, 6), Math.max(6, b.height - tipMaxH));
    setTip({ mode: "lines", x, y, title, lines });
  }, []);

  const hideTip = useCallback(() => setTip(null), []);

  const prepared = useMemo(() => {
    const n = rows.length;
    const byMonth = rows.map((r) => {
      const { fat40, fat140 } = splitFatByTypology(r);
      const m = monthMeta(targets, r.monthKey);
      return {
        row: r,
        fat40,
        fat140,
        n40: r.n40,
        n140: r.n140,
        qtd: r.qtd,
        metaFat: m.fat,
        metaQtd: m.qtd,
      };
    });

    let cf = 0;
    let cmf = 0;
    let cq = 0;
    let cmq = 0;
    const cum = byMonth.map((b) => {
      cf += b.row.fat;
      cmf += b.metaFat;
      cq += b.qtd;
      cmq += b.metaQtd;
      return { cumFat: cf, cumMetaFat: cmf, cumQtd: cq, cumMetaQtd: cmq };
    });

    const sumMetaFat = byMonth.reduce((a, b) => a + b.metaFat, 0);
    const sumMetaQtd = byMonth.reduce((a, b) => a + b.metaQtd, 0);
    const monthsWithMetaFat = byMonth.filter((b) => b.metaFat > 0).length;
    const monthsWithMetaQtd = byMonth.filter((b) => b.metaQtd > 0).length;
    const avgMetaFatMonth = monthsWithMetaFat > 0 ? sumMetaFat / monthsWithMetaFat : 0;
    const avgMetaQtdMonth = monthsWithMetaQtd > 0 ? sumMetaQtd / monthsWithMetaQtd : 0;

    const maxStackFat = Math.max(
      1,
      ...byMonth.map((b) => b.row.fat),
      ...byMonth.map((b) => b.metaFat),
    );
    const maxStackQ = Math.max(1, ...byMonth.map((b) => b.n40 + b.n140), ...byMonth.map((b) => b.metaQtd));

    const maxCumL = Math.max(1, ...cum.map((c) => Math.max(c.cumFat, c.cumMetaFat))) * 1.06;
    const maxCumR = Math.max(1, ...cum.map((c) => Math.max(c.cumQtd, c.cumMetaQtd))) * 1.06;

    const last = cum[n - 1] ?? { cumFat: 0, cumMetaFat: 0, cumQtd: 0, cumMetaQtd: 0 };

    return {
      n,
      byMonth,
      cum,
      avgMetaFatMonth,
      avgMetaQtdMonth,
      lastCumFat: last.cumFat,
      lastCumMetaFat: last.cumMetaFat,
      lastCumQtd: last.cumQtd,
      lastCumMetaQtd: last.cumMetaQtd,
      maxStackFat,
      maxStackQ,
      maxCumL,
      maxCumR,
    };
  }, [rows, targets]);

  if (!rows.length) {
    return null;
  }

  const {
    n,
    byMonth,
    cum,
    avgMetaFatMonth,
    avgMetaQtdMonth,
    lastCumFat,
    lastCumMetaFat,
    lastCumQtd,
    lastCumMetaQtd,
    maxStackFat,
    maxStackQ,
    maxCumL,
    maxCumR,
  } = prepared;

  const hitCumFat =
    (lastCumMetaFat > 0 && lastCumFat >= lastCumMetaFat * 0.995) || (lastCumMetaFat <= 0 && lastCumFat > 0);
  const hitCumQtd =
    (lastCumMetaQtd > 0 && lastCumQtd >= lastCumMetaQtd) || (lastCumMetaQtd <= 0 && lastCumQtd > 0);

  return (
    <div ref={wrapRef} className="vendas-dash">
      <div className="vendas-dash-cards vendas-dash-cards--four">
        <div className="vendas-dash-card">
          <div className="vendas-dash-card-label">Fat. acumulado</div>
          <div className="vendas-dash-card-value">{formatMoneyCompactMilBRL(lastCumFat, { withMilSuffix: false })}</div>
          <div className={`vendas-dash-card-badge ${hitCumFat ? "vendas-dash-card-badge--ok" : "vendas-dash-card-badge--miss"}`}>
            {lastCumMetaFat > 0 ? (hitCumFat ? "▲ meta atingida" : "▼ abaixo da meta") : "— sem meta acum."}
          </div>
        </div>
        <div className="vendas-dash-card">
          <div className="vendas-dash-card-label">Salas no período</div>
          <div className="vendas-dash-card-value">
            {lastCumQtd} <span className="vendas-dash-card-unit">un.</span>
          </div>
          <div className={`vendas-dash-card-badge ${hitCumQtd ? "vendas-dash-card-badge--ok" : "vendas-dash-card-badge--miss"}`}>
            {lastCumMetaQtd > 0 ? (hitCumQtd ? "▲ meta atingida" : "▼ abaixo da meta") : "— sem meta acum."}
          </div>
        </div>
        <div className="vendas-dash-card vendas-dash-card--target">
          <div className="vendas-dash-card-label">Meta fat. mensal</div>
          <div className="vendas-dash-card-value">
            {avgMetaFatMonth > 0 ? formatMoneyCompactMilBRL(avgMetaFatMonth, { withMilSuffix: false }) : "—"}
          </div>
          <div className="vendas-dash-card-sub">por mês</div>
        </div>
        <div className="vendas-dash-card vendas-dash-card--target">
          <div className="vendas-dash-card-label">Meta salas mensal</div>
          <div className="vendas-dash-card-value">
            {avgMetaQtdMonth > 0 ? (
              <>
                {Math.round(avgMetaQtdMonth)} <span className="vendas-dash-card-unit">un.</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="vendas-dash-card-sub">por mês</div>
        </div>
      </div>

      {tip?.mode === "segment" ? (
        <div
          className={`vendas-dash-tooltip vendas-dash-tooltip--segment${
            tip.detailLines?.length ? " vendas-dash-tooltip--segment-wide" : ""
          }`}
          style={{ left: tip.x, top: tip.y, transform: "translate(-100%, -50%)" }}
        >
          <div className="vendas-dash-tooltip-title">{tip.title}</div>
          <div className="vendas-dash-tooltip-row">
            <span className="vendas-dash-tooltip-swatch" style={{ background: tip.swatch }} />
            <span className="vendas-dash-tooltip-text">{tip.text}</span>
          </div>
          {tip.detailLines?.length ? (
            <div className="vendas-dash-tooltip-details">
              {tip.detailLines.map((line, idx) => (
                <div key={idx} className="vendas-dash-tooltip-detail-line">
                  {line}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : tip?.mode === "lines" ? (
        <div className="vendas-dash-tooltip vendas-dash-tooltip--compact" style={{ left: tip.x, top: tip.y }}>
          <div className="vendas-dash-tooltip-title">{tip.title}</div>
          {tip.lines.map((line, idx) => (
            <div key={idx} className="vendas-dash-tooltip-line">
              {line}
            </div>
          ))}
        </div>
      ) : null}

      <section className="vendas-dash-section">
        <h3 className="vendas-dash-h3">Faturamento mensal (total R$ vendido)</h3>
        <p className="vendas-dash-section-hint">
          Cada barra é a <strong>soma do valor vendido</strong> no mês (não é R$/m²). O detalhe por tipologia (~40 / ~140 m²) aparece ao
          passar o rato.
        </p>
        <div className="vendas-dash-legend">
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch" style={{ background: C_CUM_FAT }} /> Total no mês
          </span>
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch vendas-dash-swatch--line" style={{ borderColor: C_META }} /> Meta faturamento
          </span>
        </div>
        <div
          className="vendas-dash-chart-zone"
          onPointerLeave={(e) => {
            if (pointerEnteredDescendant(e.currentTarget, e)) return;
            hideTip();
          }}
        >
          <MonthlyTotalFatChart
            byMonth={byMonth}
            n={n}
            maxY={maxStackFat}
            onSegmentTip={showSegmentTip}
            onTipLeave={hideTip}
          />
        </div>
      </section>

      <hr className="vendas-dash-divider" />

      <section className="vendas-dash-section">
        <h3 className="vendas-dash-h3">Salas vendidas por mês</h3>
        <div className="vendas-dash-legend">
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch" style={{ background: C_Q_40 }} /> 40 m²
          </span>
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch" style={{ background: C_Q_140 }} /> 140 m²
          </span>
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch vendas-dash-swatch--line" style={{ borderColor: C_META }} /> Meta
          </span>
        </div>
        <div
          className="vendas-dash-chart-zone"
          onPointerLeave={(e) => {
            if (pointerEnteredDescendant(e.currentTarget, e)) return;
            hideTip();
          }}
        >
          <StackedQtyChart
            byMonth={byMonth}
            n={n}
            maxY={maxStackQ}
            segmentTooltipLines={segmentTooltipLines}
            onSegmentTip={showSegmentTip}
            onTipLeave={hideTip}
          />
        </div>
      </section>

      <hr className="vendas-dash-divider" />

      <section className="vendas-dash-section">
        <h3 className="vendas-dash-h3">Curva de vendas acumulada no período</h3>
        <div className="vendas-dash-legend">
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch vendas-dash-swatch--dot" style={{ background: C_CUM_FAT }} /> Fat. acumulado
          </span>
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch vendas-dash-swatch--dot" style={{ background: C_CUM_Q }} /> Salas acumuladas
          </span>
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch vendas-dash-swatch--line" style={{ borderColor: C_META }} /> Meta acumulada fat.
          </span>
          <span className="vendas-dash-legend-item">
            <i className="vendas-dash-swatch vendas-dash-swatch--line" style={{ borderColor: C_Q_140 }} /> Meta acumulada salas
          </span>
        </div>
        <div
          className="vendas-dash-chart-zone"
          onPointerLeave={(e) => {
            if (pointerEnteredDescendant(e.currentTarget, e)) return;
            hideTip();
          }}
        >
          <DualCumulativeChart cum={cum} rows={rows} n={n} maxL={maxCumL} maxR={maxCumR} onLinesTip={showLinesTip} onTipLeave={hideTip} />
        </div>
      </section>
    </div>
  );
}

type MonthBlock = {
  row: VendaMesRow;
  fat40: number;
  fat140: number;
  n40: number;
  n140: number;
  qtd: number;
  metaFat: number;
  metaQtd: number;
};

/** Uma barra por mês = soma do valor vendido (R$), alinhado à tabela do relatório. */
function MonthlyTotalFatChart({
  byMonth,
  n,
  maxY,
  onSegmentTip,
  onTipLeave,
}: {
  byMonth: MonthBlock[];
  n: number;
  maxY: number;
  onSegmentTip: (
    e: ReactPointerEvent,
    payload: { title: string; swatch: string; text: string; detailLines?: string[] },
  ) => void;
  onTipLeave: () => void;
}) {
  const [focusI, setFocusI] = useState<number | null>(null);

  const w = 920;
  const h = 260;
  const padL = 56;
  const padR = 24;
  const padT = 16;
  const padB = 52;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const y0 = padT + innerH;
  const band = innerW / Math.max(n, 1);
  const barW = Math.min(40, band * 0.55);

  const yScale = (v: number) => y0 - (v / maxY) * innerH;

  const metaPath = byMonth
    .map((b, i) => {
      const cx = padL + (i + 0.5) * band;
      const yy = yScale(b.metaFat);
      return `${i === 0 ? "M" : "L"} ${cx} ${yy}`;
    })
    .join(" ");

  const tickFracs = [0, 0.25, 0.5, 0.75, 1];
  const ticks = tickFracs.map((t) => ({
    y: padT + innerH * (1 - t),
    lab: formatMoneyAxisBRL(maxY * t),
    key: t,
  }));

  const barOp = (bi: number) => {
    if (focusI == null) return 1;
    return focusI === bi ? 1 : 0.35;
  };

  const labelOp = (bi: number) => {
    if (focusI == null) return 1;
    return focusI === bi ? 1 : 0.35;
  };

  return (
    <svg
      className="vendas-dash-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerLeave={(e) => {
        if (pointerEnteredDescendant(e.currentTarget as SVGSVGElement, e)) return;
        setFocusI(null);
        onTipLeave();
      }}
    >
      {ticks.map((t) => (
        <g key={t.key}>
          <line x1={padL} y1={t.y} x2={w - padR} y2={t.y} stroke="rgba(148,163,184,0.12)" strokeWidth={1} />
          <text x={padL - 8} y={t.y + 3} textAnchor="end" fill="rgba(148,163,184,0.65)" fontSize={9} fontFamily="IBM Plex Mono, monospace">
            {t.lab}
          </text>
        </g>
      ))}
      {byMonth.map((b, bi) => {
        const cx = padL + (bi + 0.5) * band;
        const x = cx - barW / 2;
        const fat = b.row.fat;
        const hBar = (fat / maxY) * innerH;
        const detailLines: string[] = [];
        if (b.fat40 > 0) detailLines.push(`Tipologia ~40 m²: ${formatMoneyBRL(b.fat40)}`);
        if (b.fat140 > 0) detailLines.push(`Tipologia ~140 m²: ${formatMoneyBRL(b.fat140)}`);
        const tip = (e: ReactPointerEvent) => {
          setFocusI(bi);
          onSegmentTip(e, {
            title: b.row.label,
            swatch: C_CUM_FAT,
            text: `Total vendido: ${formatMoneyBRL(fat)}`,
            detailLines: detailLines.length ? detailLines : undefined,
          });
        };
        return (
          <g key={b.row.monthKey}>
            <rect
              className="vendas-dash-bar-seg"
              x={x}
              y={y0 - hBar}
              width={barW}
              height={Math.max(hBar, 0)}
              rx={4}
              fill={C_CUM_FAT}
              opacity={barOp(bi)}
              style={{
                cursor: fat > 0 ? "crosshair" : "default",
                pointerEvents: fat > 0 ? "auto" : "none",
              }}
              onPointerEnter={fat > 0 ? tip : undefined}
              onPointerMove={fat > 0 ? tip : undefined}
            />
            <text
              x={cx}
              y={h - 14}
              textAnchor="middle"
              fill="rgba(148,163,184,0.85)"
              fontSize={8}
              fontFamily="IBM Plex Mono, monospace"
              opacity={labelOp(bi)}
              style={{ pointerEvents: "none" }}
            >
              {b.row.label}
            </text>
          </g>
        );
      })}
      <path
        d={metaPath}
        fill="none"
        stroke={C_META}
        strokeWidth={2}
        strokeDasharray="7 5"
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="none"
      />
    </svg>
  );
}

function StackedQtyChart({
  byMonth,
  n,
  maxY,
  segmentTooltipLines,
  onSegmentTip,
  onTipLeave,
}: {
  byMonth: MonthBlock[];
  n: number;
  maxY: number;
  segmentTooltipLines: Map<string, { typ40: string[]; typ140: string[] }>;
  onSegmentTip: (
    e: ReactPointerEvent,
    payload: { title: string; swatch: string; text: string; detailLines?: string[] },
  ) => void;
  onTipLeave: () => void;
}) {
  const [focus, setFocus] = useState<{ i: number; seg: "40" | "140" } | null>(null);

  const w = 920;
  const h = 260;
  const padL = 56;
  const padR = 24;
  const padT = 16;
  const padB = 52;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const y0 = padT + innerH;
  const band = innerW / Math.max(n, 1);
  const barW = Math.min(40, band * 0.55);
  const yScale = (v: number) => y0 - (v / maxY) * innerH;

  const metaPath = byMonth
    .map((b, i) => {
      const cx = padL + (i + 0.5) * band;
      return `${i === 0 ? "M" : "L"} ${cx} ${yScale(b.metaQtd)}`;
    })
    .join(" ");

  const tickFracs = [0, 0.25, 0.5, 0.75, 1];
  const ticks = tickFracs.map((t) => ({
    y: padT + innerH * (1 - t),
    lab: `${Math.round(maxY * t)} un.`,
    key: t,
  }));

  const segOp = (bi: number, seg: "40" | "140") => {
    if (!focus) return 1;
    if (focus.i !== bi) return 0.28;
    return focus.seg === seg ? 1 : 0.28;
  };

  const labelOp = (bi: number) => {
    if (!focus) return 1;
    return focus.i === bi ? 1 : 0.28;
  };

  return (
    <svg
      className="vendas-dash-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerLeave={(e) => {
        if (pointerEnteredDescendant(e.currentTarget as SVGSVGElement, e)) return;
        setFocus(null);
        onTipLeave();
      }}
    >
      {ticks.map((t) => (
        <g key={t.key}>
          <line x1={padL} y1={t.y} x2={w - padR} y2={t.y} stroke="rgba(148,163,184,0.12)" strokeWidth={1} />
          <text x={padL - 8} y={t.y + 3} textAnchor="end" fill="rgba(148,163,184,0.65)" fontSize={9} fontFamily="IBM Plex Mono, monospace">
            {t.lab}
          </text>
        </g>
      ))}
      {byMonth.map((b, bi) => {
        const cx = padL + (bi + 0.5) * band;
        const x = cx - barW / 2;
        const h40 = (b.n40 / maxY) * innerH;
        const h140 = (b.n140 / maxY) * innerH;
        const segLines = segmentTooltipLines.get(b.row.monthKey);
        const tip40 = (e: ReactPointerEvent) => {
          setFocus({ i: bi, seg: "40" });
          const lines = segLines?.typ40;
          onSegmentTip(e, {
            title: b.row.label,
            swatch: C_Q_40,
            text: `40 m²: ${b.n40} un.`,
            detailLines: lines?.length ? lines : undefined,
          });
        };
        const tip140 = (e: ReactPointerEvent) => {
          setFocus({ i: bi, seg: "140" });
          const lines = segLines?.typ140;
          onSegmentTip(e, {
            title: b.row.label,
            swatch: C_Q_140,
            text: `140 m²: ${b.n140} un.`,
            detailLines: lines?.length ? lines : undefined,
          });
        };
        return (
          <g key={b.row.monthKey}>
            <rect
              className="vendas-dash-bar-seg"
              x={x}
              y={y0 - h40 - h140}
              width={barW}
              height={Math.max(h40, 0)}
              rx={h140 > 0 ? 0 : 4}
              fill={C_Q_40}
              opacity={segOp(bi, "40")}
              style={{ cursor: b.n40 > 0 ? "crosshair" : "default", pointerEvents: b.n40 > 0 ? "auto" : "none" }}
              onPointerEnter={b.n40 > 0 ? tip40 : undefined}
              onPointerMove={b.n40 > 0 ? tip40 : undefined}
            />
            <rect
              className="vendas-dash-bar-seg"
              x={x}
              y={y0 - h140}
              width={barW}
              height={Math.max(h140, 0)}
              rx={h40 > 0 ? 0 : 4}
              fill={C_Q_140}
              opacity={segOp(bi, "140")}
              style={{ cursor: b.n140 > 0 ? "crosshair" : "default", pointerEvents: b.n140 > 0 ? "auto" : "none" }}
              onPointerEnter={b.n140 > 0 ? tip140 : undefined}
              onPointerMove={b.n140 > 0 ? tip140 : undefined}
            />
            <text
              x={cx}
              y={h - 14}
              textAnchor="middle"
              fill="rgba(148,163,184,0.85)"
              fontSize={8}
              fontFamily="IBM Plex Mono, monospace"
              opacity={labelOp(bi)}
              style={{ pointerEvents: "none" }}
            >
              {b.row.label}
            </text>
          </g>
        );
      })}
      <path d={metaPath} fill="none" stroke={C_META} strokeWidth={2} strokeDasharray="7 5" pointerEvents="none" />
    </svg>
  );
}

function DualCumulativeChart({
  cum,
  rows,
  n,
  maxL,
  maxR,
  onLinesTip,
  onTipLeave,
}: {
  cum: Array<{ cumFat: number; cumMetaFat: number; cumQtd: number; cumMetaQtd: number }>;
  rows: VendaMesRow[];
  n: number;
  maxL: number;
  maxR: number;
  onLinesTip: (e: ReactPointerEvent, title: string, lines: string[]) => void;
  onTipLeave: () => void;
}) {
  const w = 920;
  const h = 300;
  const padL = 72;
  const padR = 72;
  const padT = 20;
  const padB = 48;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const y0 = padT + innerH;
  const step = n <= 1 ? 0 : innerW / (n - 1);

  const xAt = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + i * step);
  const yL = (v: number) => y0 - (v / maxL) * innerH;
  const yR = (v: number) => y0 - (v / maxR) * innerH;

  const pathLX = (fn: (i: number) => number) => cum.map((_, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${fn(i)}`).join(" ");

  const dFat = pathLX((i) => yL(cum[i]!.cumFat));
  const dMetaFat = pathLX((i) => yL(cum[i]!.cumMetaFat));
  const dQ = pathLX((i) => yR(cum[i]!.cumQtd));
  const dMetaQ = pathLX((i) => yR(cum[i]!.cumMetaQtd));

  const areaFat =
    cum.length > 0
      ? `${dFat} L ${xAt(n - 1)} ${y0} L ${xAt(0)} ${y0} Z`
      : "";
  const areaQ =
    cum.length > 0
      ? `${dQ} L ${xAt(n - 1)} ${y0} L ${xAt(0)} ${y0} Z`
      : "";

  const tickFracs = [0, 0.25, 0.5, 0.75, 1];
  const ticksL = tickFracs.map((t) => ({
    y: padT + innerH * (1 - t),
    lab: formatMoneyAxisBRL(maxL * t),
    key: t,
  }));
  const ticksR = tickFracs.map((t) => ({
    y: padT + innerH * (1 - t),
    lab: `${Math.round(maxR * t)} un.`,
    key: t,
  }));

  const yMid = padT + innerH / 2;

  return (
    <svg
      className="vendas-dash-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerLeave={(e) => {
        if (pointerEnteredDescendant(e.currentTarget as SVGSVGElement, e)) return;
        onTipLeave();
      }}
    >
      {ticksL.map((t) => (
        <line key={`gl-${t.key}`} x1={padL} y1={t.y} x2={w - padR} y2={t.y} stroke="rgba(148,163,184,0.1)" strokeWidth={1} />
      ))}
      {ticksL.map((t) => (
        <text key={`tl-${t.key}`} x={padL - 10} y={t.y + 3} textAnchor="end" fill="rgba(148,163,184,0.6)" fontSize={8} fontFamily="IBM Plex Mono, monospace">
          {t.lab}
        </text>
      ))}
      {ticksR.map((t) => (
        <text key={`tr-${t.key}`} x={w - padR + 10} y={t.y + 3} textAnchor="start" fill="rgba(148,163,184,0.6)" fontSize={8} fontFamily="IBM Plex Mono, monospace">
          {t.lab}
        </text>
      ))}

      <text
        x={14}
        y={yMid}
        fill={C_CUM_FAT}
        fontSize={9}
        fontWeight={600}
        fontFamily="IBM Plex Mono, monospace"
        textAnchor="middle"
        transform={`rotate(-90, 14, ${yMid})`}
      >
        R$ acumulado
      </text>
      <text
        x={w - 18}
        y={yMid}
        fill={C_CUM_Q}
        fontSize={9}
        fontWeight={600}
        fontFamily="IBM Plex Mono, monospace"
        textAnchor="middle"
        transform={`rotate(-90, ${w - 18}, ${yMid})`}
      >
        Salas acumuladas
      </text>

      <path d={areaQ} fill="rgba(147, 51, 234, 0.12)" stroke="none" pointerEvents="none" />
      <path d={areaFat} fill="rgba(59, 130, 246, 0.14)" stroke="none" pointerEvents="none" />

      <path d={dMetaFat} fill="none" stroke={C_META} strokeWidth={2} strokeDasharray="8 5" pointerEvents="none" />
      <path d={dMetaQ} fill="none" stroke={C_Q_140} strokeWidth={2} strokeDasharray="8 5" pointerEvents="none" />
      <path d={dFat} fill="none" stroke={C_CUM_FAT} strokeWidth={2.5} pointerEvents="none" />
      <path d={dQ} fill="none" stroke={C_CUM_Q} strokeWidth={2.5} pointerEvents="none" />

      {cum.map((_, i) => (
        <circle
          key={`dot-f-${i}`}
          cx={xAt(i)}
          cy={yL(cum[i]!.cumFat)}
          r={3.5}
          fill={C_CUM_FAT}
          stroke="rgba(15,23,42,0.45)"
          strokeWidth={0.75}
          pointerEvents="none"
        />
      ))}
      {cum.map((_, i) => (
        <circle
          key={`dot-q-${i}`}
          cx={xAt(i)}
          cy={yR(cum[i]!.cumQtd)}
          r={3.5}
          fill={C_CUM_Q}
          stroke="rgba(15,23,42,0.45)"
          strokeWidth={0.75}
          pointerEvents="none"
        />
      ))}

      {rows.map((r, i) => {
        const cx = xAt(i);
        const slotW = n <= 1 ? innerW : Math.max(step * 0.75, 20);
        const tip = (e: ReactPointerEvent) =>
          onLinesTip(e, r.label, [
            `${formatMoneyCompactMilBRL(cum[i]!.cumFat)} · ${cum[i]!.cumQtd} salas`,
            `Meta ${formatMoneyCompactMilBRL(cum[i]!.cumMetaFat)} · ${cum[i]!.cumMetaQtd} salas`,
          ]);
        return (
          <rect
            key={`hit-${r.monthKey}`}
            x={cx - slotW / 2}
            y={padT}
            width={slotW}
            height={innerH}
            fill="transparent"
            onPointerEnter={tip}
            onPointerMove={tip}
            style={{ cursor: "crosshair" }}
          />
        );
      })}
      {rows.map((r, i) => (
        <text
          key={`ml-${r.monthKey}`}
          x={xAt(i)}
          y={h - 12}
          textAnchor="middle"
          fill="rgba(148,163,184,0.85)"
          fontSize={8}
          fontFamily="IBM Plex Mono, monospace"
          style={{ pointerEvents: "none" }}
        >
          {r.label}
        </text>
      ))}
    </svg>
  );
}
