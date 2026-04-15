import type { BuildingSnapshot, RoomRecord, StatusSalaHistoryEntry } from "@/lib/buildingTypes";
import { normalizeStatusSala } from "@/lib/treeTowerStatusSala";

/** Tipologia ~40 m² vs esquina ~140 m² (limiar 100 m²). */
export function bucketAreaTipologia40vs140(area: number): "40" | "140" | null {
  if (!Number.isFinite(area) || area <= 0) return null;
  if (area < 100) return "40";
  return "140";
}

/** Mês civil local (YYYY-MM) usado nos gráficos e na tabela — alinhado ao calendário da `dataVenda` na sala. */
export function monthKeyFromTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Data local AAAA-MM-DD (para inputs `type="date"` e comparações). */
export function formatSaleDateIsoLocal(ms: number | undefined | null): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function lastNCalendarMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const anchor = new Date();
  anchor.setDate(1);
  anchor.setHours(12, 0, 0, 0);
  for (let k = n - 1; k >= 0; k--) {
    const dd = new Date(anchor.getFullYear(), anchor.getMonth() - k, 1);
    keys.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Soma `delta` meses a `YYYY-MM` (primeiro dia de cada mês). */
export function addMonthsToMonthKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split("-").map(Number);
  if (!Number.isFinite(ys) || !Number.isFinite(ms)) return monthKey;
  const d = new Date(ys, ms - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Todos os meses civil de `startKey` a `endKey` inclusive (`YYYY-MM`, ordem lexicográfica = cronológica). */
export function enumerateMonthKeysInclusive(startKey: string, endKey: string): string[] {
  if (startKey > endKey) return [];
  const out: string[] = [];
  let cur = startKey;
  while (cur <= endKey) {
    out.push(cur);
    cur = addMonthsToMonthKey(cur, 1);
  }
  return out;
}

/** Não alargar o eixo X indefinidamente se houver datas muito antigas. */
const VENDAS_REPORT_MAX_MONTH_SPAN = 72;

/**
 * Eixo temporal do relatório: começa no mais cedo entre (i) o primeiro mês da janela “últimos N”
 * e (ii) o mês da venda mais antiga contabilizada; termina no mais recente entre a janela e qualquer venda futura.
 * Assim, as `dataVenda` fora dos últimos N meses ainda aparecem no gráfico (até {@link VENDAS_REPORT_MAX_MONTH_SPAN} meses).
 */
export function monthKeysForVendasReport(building: BuildingSnapshot | null, numMonths: number): string[] {
  const rolling = lastNCalendarMonthKeys(numMonths);
  if (rolling.length === 0) return [];

  let startKey = rolling[0]!;
  let endKey = rolling[rolling.length - 1]!;

  for (const room of Object.values(building?.roomsById ?? {})) {
    const at = vendidoAtMs(room);
    if (at == null) continue;
    const mk = monthKeyFromTs(at);
    if (mk < startKey) startKey = mk;
    if (mk > endKey) endKey = mk;
  }

  let keys = enumerateMonthKeysInclusive(startKey, endKey);
  if (keys.length > VENDAS_REPORT_MAX_MONTH_SPAN) {
    startKey = addMonthsToMonthKey(endKey, -(VENDAS_REPORT_MAX_MONTH_SPAN - 1));
    keys = enumerateMonthKeysInclusive(startKey, endKey);
  }
  return keys;
}

export function formatMonthLabelPt(key: string): string {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export function shortMonthLabel(key: string): string {
  const [ys, ms] = key.split("-");
  if (!ys || !ms) return key;
  return `${ms}/${ys.slice(2)}`;
}

/** Mesma regra do gráfico de faturamento (valor da venda ou valor do imóvel). */
export function valorFaturamentoVenda(r: RoomRecord): number {
  const m = r.meta;
  if (!m) return 0;
  if (typeof m.valorVenda === "number" && Number.isFinite(m.valorVenda)) return m.valorVenda;
  if (typeof m.valorImovel === "number" && Number.isFinite(m.valorImovel)) return m.valorImovel;
  return 0;
}

export type VendaReportDateFonte = "data_sala" | "historico_status";

/** Entradas criadas na importação do seed — o `at` é igual para todas e não representa a data de venda. */
function isImportHistoryPlaceholder(h: StatusSalaHistoryEntry): boolean {
  if (h.by === "import") return true;
  if (typeof h.reason === "string" && /import/i.test(h.reason)) return true;
  return false;
}

/**
 * Momento da venda para relatórios (mesmo instante que entra no gráfico “Vendas por período”):
 * `meta.dataVenda` (definida na app / seed) tem prioridade; senão a primeira transição **real** para VENDIDO
 * no histórico (exclui marcas de importação). Não usa `lastUpdatedAt` — seria o mesmo instante para
 * muitas salas e agrupava tudo num único mês.
 */
export function vendidoMomentoRelatorio(room: RoomRecord): { atMs: number; fonte: VendaReportDateFonte } | null {
  if (normalizeStatusSala(room.statusSala ?? room.meta?.statusSalaOriginal) !== "VENDIDO") return null;
  const dv = room.meta?.dataVenda;
  if (typeof dv === "number" && Number.isFinite(dv) && dv > 0) return { atMs: dv, fonte: "data_sala" };
  let first: number | null = null;
  for (const h of room.statusSalaHistory ?? []) {
    if (isImportHistoryPlaceholder(h)) continue;
    if (normalizeStatusSala(h.to) !== "VENDIDO") continue;
    if (normalizeStatusSala(h.from) === "VENDIDO") continue;
    if (first === null || h.at < first) first = h.at;
  }
  if (first !== null) return { atMs: first, fonte: "historico_status" };
  return null;
}

export function vendidoAtMs(room: RoomRecord): number | null {
  return vendidoMomentoRelatorio(room)?.atMs ?? null;
}

/** Uma linha legível para tooltip (sala + comprador). */
export function formatVendaTooltipLine(room: RoomRecord): string {
  const nomeSala = String(room.name ?? "").trim() || `Sala #${room.id}`;
  const comp = String(room.meta?.comprador ?? "").trim();
  return comp ? `${nomeSala} — ${comp}` : `${nomeSala} — (sem comprador)`;
}

/** Salas contabilizadas naquele mês e tipologia (mesma regra que {@link aggregateVendasPorMes}). */
export function listSalasVendidasMesTipologia(
  building: BuildingSnapshot | null,
  monthKey: string,
  typ: "40" | "140",
): RoomRecord[] {
  const out: RoomRecord[] = [];
  for (const room of Object.values(building?.roomsById ?? {})) {
    const at = vendidoAtMs(room);
    if (at == null) continue;
    if (monthKeyFromTs(at) !== monthKey) continue;
    if (bucketAreaTipologia40vs140(room.area) !== typ) continue;
    out.push(room);
  }
  out.sort((a, b) => (a.floor !== b.floor ? a.floor - b.floor : a.id - b.id));
  return out;
}

export type VendaMesRow = {
  monthKey: string;
  label: string;
  qtd: number;
  fat: number;
  n40: number;
  n140: number;
};

export function aggregateVendasPorMes(
  building: BuildingSnapshot | null,
  numMonths: number,
): { rows: VendaMesRow[]; totais: { qtd: number; fat: number; n40: number; n140: number } } {
  const monthKeys = monthKeysForVendasReport(building, numMonths);
  const byMonth = new Map<string, { qtd: number; fat: number; n40: number; n140: number }>();
  for (const k of monthKeys) byMonth.set(k, { qtd: 0, fat: 0, n40: 0, n140: 0 });

  for (const room of Object.values(building?.roomsById ?? {})) {
    const at = vendidoAtMs(room);
    if (at == null) continue;
    const mk = monthKeyFromTs(at);
    const row = byMonth.get(mk);
    if (!row) continue;
    row.qtd += 1;
    row.fat += valorFaturamentoVenda(room);
    const typ = bucketAreaTipologia40vs140(room.area);
    if (typ === "40") row.n40 += 1;
    else if (typ === "140") row.n140 += 1;
  }

  const rows: VendaMesRow[] = monthKeys.map((monthKey) => {
    const v = byMonth.get(monthKey)!;
    return {
      monthKey,
      label: shortMonthLabel(monthKey),
      qtd: v.qtd,
      fat: v.fat,
      n40: v.n40,
      n140: v.n140,
    };
  });
  const totais = rows.reduce(
    (a, r) => ({
      qtd: a.qtd + r.qtd,
      fat: a.fat + r.fat,
      n40: a.n40 + r.n40,
      n140: a.n140 + r.n140,
    }),
    { qtd: 0, fat: 0, n40: 0, n140: 0 },
  );
  return { rows, totais };
}
