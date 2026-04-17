import type { VendaMesRow } from "@/lib/vendasMensaisAgg";

export type SalesTargetEntry = {
  faturamento?: number;
  quantidade?: number;
  n40?: number;
  n140?: number;
};

export type TargetsMap = Record<string, SalesTargetEntry>;

/** Campos de meta usados nos gráficos e na tabela. */
export type TargetMetric = "faturamento" | "quantidade" | "n40" | "n140";

export type SimulatedByMonth = Partial<Record<string, Partial<Record<TargetMetric, boolean>>>>;

const PREVIEW_RATIO = 1.1;

/** Quando não há realizado no mês, estes valores servem só para pré-visualização de layout (apresentações). */
const DEMO_META = {
  faturamento: 4_500_000,
  quantidade: 18,
  n40: 14,
  n140: 4,
} as const;

function pickApi(cur: SalesTargetEntry | undefined, field: TargetMetric): number | undefined {
  const v = cur?.[field];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return undefined;
}

/**
 * Junta metas do JSON com pré-visualização: onde não houver meta oficial (>0),
 * usa realizado × 1,1 (arredondado) ou valores de demonstração se o realizado for zero.
 */
export function mergeTargetsWithSimulation(rows: VendaMesRow[], api: TargetsMap): {
  targets: TargetsMap;
  simulated: SimulatedByMonth;
} {
  const targets: TargetsMap = {};
  const simulated: SimulatedByMonth = {};

  for (const r of rows) {
    const cur = api[r.monthKey];
    const out: SalesTargetEntry = {};
    const sim: Partial<Record<TargetMetric, boolean>> = {};

    const apiFat = pickApi(cur, "faturamento");
    if (apiFat != null) out.faturamento = apiFat;
    else if (r.fat > 0) {
      out.faturamento = r.fat * PREVIEW_RATIO;
      sim.faturamento = true;
    } else {
      out.faturamento = DEMO_META.faturamento;
      sim.faturamento = true;
    }

    const apiQ = pickApi(cur, "quantidade");
    if (apiQ != null) out.quantidade = apiQ;
    else if (r.qtd > 0) {
      out.quantidade = Math.max(1, Math.ceil(r.qtd * PREVIEW_RATIO));
      sim.quantidade = true;
    } else {
      out.quantidade = DEMO_META.quantidade;
      sim.quantidade = true;
    }

    const apiN40 = pickApi(cur, "n40");
    if (apiN40 != null) out.n40 = apiN40;
    else if (r.n40 > 0) {
      out.n40 = Math.max(1, Math.ceil(r.n40 * PREVIEW_RATIO));
      sim.n40 = true;
    } else {
      out.n40 = DEMO_META.n40;
      sim.n40 = true;
    }

    const apiN140 = pickApi(cur, "n140");
    if (apiN140 != null) out.n140 = apiN140;
    else if (r.n140 > 0) {
      out.n140 = Math.max(1, Math.ceil(r.n140 * PREVIEW_RATIO));
      sim.n140 = true;
    } else {
      out.n140 = DEMO_META.n140;
      sim.n140 = true;
    }

    targets[r.monthKey] = out;
    simulated[r.monthKey] = sim;
  }

  return { targets, simulated };
}

export function isTargetSimulated(simulated: SimulatedByMonth, monthKey: string, field: TargetMetric): boolean {
  return simulated[monthKey]?.[field] === true;
}

const ALL_TARGET_METRICS: TargetMetric[] = ["faturamento", "quantidade", "n40", "n140"];

/** Só o que veio da API (gestor); usado antes da data de “metas oficiais” no eixo, para não misturar com simulação. */
export function officialSalesTargetEntry(cur: SalesTargetEntry | undefined): SalesTargetEntry | null {
  if (!cur) return null;
  const out: SalesTargetEntry = {};
  for (const m of ALL_TARGET_METRICS) {
    const v = pickApi(cur, m);
    if (v === undefined) continue;
    if (m === "faturamento") out.faturamento = v;
    else if (m === "quantidade") out.quantidade = v;
    else if (m === "n40") out.n40 = v;
    else out.n140 = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
