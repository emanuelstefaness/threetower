import * as XLSX from "xlsx";
import type { SeedRoom } from "./generateBuilding";

/**
 * Mantém o seed completo (ex.: 362 salas) e substitui apenas as linhas cujo STATUS SALA na planilha oficial é **VENDIDO**.
 * Linhas não vendidas na nova planilha não sobrescrevem o estado anterior — assim a base antiga permanece para o resto.
 */
export function mergeOfficialVendidosIntoBase(base: SeedRoom[], officialParsed: SeedRoom[]): SeedRoom[] {
  const vendidoById = new Map<number, SeedRoom>();
  for (const row of officialParsed) {
    const ss = (row.statusSala ?? row.meta?.statusSalaOriginal ?? "").trim().toUpperCase();
    if (ss === "VENDIDO") {
      vendidoById.set(row.id, row);
    }
  }
  const baseIds = new Set(base.map((r) => r.id));
  const merged = base.map((room) => vendidoById.get(room.id) ?? room);
  const extras = Array.from(vendidoById.values()).filter((r) => !baseIds.has(r.id));
  return [...merged, ...extras].sort((a, b) => a.floor - b.floor || a.id - b.id);
}

function normalizeHeader(h: unknown): string {
  const s = String(h ?? "").trim();
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseRoomIdFromUnit(unitRaw: unknown): number | undefined {
  const s = String(unitRaw ?? "").trim();
  const m = s.match(/(\d{3,4})/);
  if (!m) return undefined;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : undefined;
}

function slotFromRoomId(roomId: number): string | undefined {
  const n = roomId % 100;
  if (!Number.isFinite(n) || n <= 0 || n > 99) return undefined;
  return `F-${String(n).padStart(2, "0")}`;
}

function mapStatus(statusSalaRaw: unknown): string {
  const s = String(statusSalaRaw ?? "").trim().toUpperCase();
  if (s === "VENDIDO") return "ocupada";
  if (s === "ESTOQUE") return "disponivel";
  return "disponivel";
}

/** Primeira linha onde aparece STATUS SALA (cabeçalhos). */
function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const row = rows[i] ?? [];
    const cells = (row as unknown[]).map((c) => normalizeHeader(c));
    if (cells.includes("STATUS SALA") && cells.some((c) => c === "UNIDADE" || c.includes("UNIDADE"))) {
      return i;
    }
  }
  return 1;
}

function buildHeaderMap(headerRow: unknown[]): Map<string, number> {
  const headerMap = new Map<string, number>();
  (headerRow as unknown[]).forEach((h, idx) => {
    const key = normalizeHeader(h);
    if (key) headerMap.set(key, idx);
  });
  return headerMap;
}

/**
 * Lê Excel "Salas Tree Tower": prefere aba **Oficial**; cabeçalhos na primeira linha que contiver STATUS SALA + UNIDADE.
 */
export function parseTreeTowerXlsxBuffer(buffer: Buffer): SeedRoom[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.includes("Oficial") ? "Oficial" : wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha sem abas");
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("Aba inválida");
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (rows.length < 2) throw new Error("Planilha vazia ou formato inesperado");

  const headerIdx = findHeaderRowIndex(rows);
  const headerMap = buildHeaderMap((rows[headerIdx] ?? []) as unknown[]);
  const col = (name: string) => headerMap.get(normalizeHeader(name));

  const out: SeedRoom[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = (rows[r] ?? []) as unknown[];
    const ixU = col("UNIDADE");
    const unidade = ixU !== undefined ? row[ixU] ?? "" : "";
    const roomId = parseRoomIdFromUnit(unidade);
    if (!roomId) continue;

    const ixN = col("NUMERO ANDAR");
    const floorNum = (ixN !== undefined ? toNumber(row[ixN]) : undefined) ?? Math.floor(roomId / 100);
    const ixAp = col("AREA PRIVATIVA M2");
    const ixApAlt = col("AREA PRIVATIVA M");
    const areaPriv =
      (ixAp !== undefined ? toNumber(row[ixAp]) : undefined) ??
      (ixApAlt !== undefined ? toNumber(row[ixApAlt]) : undefined) ??
      undefined;
    const ixS = col("STATUS SALA");
    const statusSalaRaw = ixS !== undefined ? row[ixS] ?? "" : "";
    const statusSala = String(statusSalaRaw).trim();
    const statusUp = statusSala.toUpperCase();

    const ixVm2 = col("VALOR M2") ?? col("0.02");
    const valorM2 = ixVm2 !== undefined ? toNumber(row[ixVm2]) : undefined;

    const corretor = (() => {
      const c = col("CORRETOR");
      return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
    })();
    const imobiliaria = (() => {
      const c = col("IMOBILIARIA");
      return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
    })();
    const comprador = (() => {
      const c = col("COMPRADOR");
      return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
    })();

    const displayName =
      statusUp === "VENDIDO" && comprador ? comprador : `Sala ${roomId}`;

    out.push({
      id: roomId,
      floor: floorNum,
      status: mapStatus(statusSalaRaw),
      statusSala,
      name: displayName,
      area: areaPriv ?? 25,
      planSlot: slotFromRoomId(roomId),
      meta: {
        andar: (() => {
          const c = col("ANDAR");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        numeroAndar: floorNum,
        unidade: String(unidade).trim(),
        escrituras: (() => {
          const c = col("ESCRITURAS");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        posicao: (() => {
          const c = col("POSICAO");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        matricula: (() => {
          const c1 = col("MATRIC.");
          const c2 = col("MATRIC");
          const v = c1 !== undefined ? row[c1] : c2 !== undefined ? row[c2] : "";
          return String(v ?? "").trim() || undefined;
        })(),
        controle: (() => {
          const c = col("CONTROLE");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        areaCobertaM2: (() => {
          const c = col("AREA COBERTA M2");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        areaDescobertaM2: (() => {
          const c = col("AREA DESCOBERTA M2");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        areaPrivativaM2: areaPriv,
        baseCalculoVenda: (() => {
          const c = col("BASE DE CALCULO VENDA");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        precificacao: (() => {
          const c = col("PRECIFICACAO");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        faixa: (() => {
          const c = col("FAIXA");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        valorM2,
        valorImovel: (() => {
          const c = col("VALOR DO IMOVEL");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        corretor,
        imobiliaria,
        comprador,
        formaPagamento: (() => {
          const c = col("FORMA DE PAGAMENTO");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        prazoPagamento: (() => {
          const c = col("PRAZO DE PAGAMENTO");
          return c !== undefined ? String(row[c] ?? "").trim() || undefined : undefined;
        })(),
        valorVenda: (() => {
          const c = col("VALOR DA VENDA");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        descontos: (() => {
          const c = col("DESCONTOS");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        dataVenda: (() => {
          const c = col("DATA DA VENDA");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        competencia: (() => {
          const c = col("COMPETENCIA");
          return c !== undefined ? toNumber(row[c]) : undefined;
        })(),
        statusSalaOriginal: statusSala || undefined,
      },
    });
  }

  out.sort((a, b) => a.floor - b.floor || a.id - b.id);
  return out;
}
