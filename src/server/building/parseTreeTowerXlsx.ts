import * as XLSX from "xlsx";
import type { RoomStatus } from "@/lib/buildingTypes";
import type { SeedRoom } from "./generateBuilding";

/**
 * Mantém o seed completo (aba **Pedro**) e substitui apenas as linhas cujo STATUS SALA na aba **Oficial** é **VENDIDO**.
 * Linhas não vendidas na Oficial não sobrescrevem a Pedro.
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

/** Igual à lógica do store ao derivar status operacional a partir do texto STATUS SALA. */
function operationalStatusFromStatusSala(statusSala: string): RoomStatus {
  const u = statusSala.trim().toUpperCase();
  if (u === "INDISPONIVEL" || u === "INDISPONÍVEL") return "ocupada";
  if (u === "VENDIDO") return "ocupada";
  if (u.includes("RESERV")) return "reservada";
  if (u.includes("MANUT")) return "manutencao";
  if (u.includes("DBN")) return "reservada";
  if (u.includes("ATACADO") || u.includes("AUDIT") || u.includes("ROOFTOP")) return "manutencao";
  return "disponivel";
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

function findSheetNameCI(sheetNames: string[], wanted: string): string | undefined {
  const w = wanted.trim().toLowerCase();
  return sheetNames.find((n) => n.trim().toLowerCase() === w);
}

function parseWorksheet(ws: XLSX.WorkSheet): SeedRoom[] {
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
      status: operationalStatusFromStatusSala(statusSala || "disponivel"),
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

/**
 * Lê o workbook completo: aba **Pedro** = todas as salas e status; aba **Oficial** (opcional) = só sobrescreve **VENDIDO** (dados de venda).
 */
export function buildSeedFromPedroAndOficialWorkbook(buffer: Buffer): SeedRoom[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const names = wb.SheetNames;
  if (names.length === 0) throw new Error("Ficheiro Excel sem abas");

  const pedroName = findSheetNameCI(names, "Pedro");
  if (!pedroName) {
    throw new Error(
      'O Excel deve ter uma aba "Pedro" com todas as salas e os status. A aba "Oficial" só atualiza as vendidas.'
    );
  }

  const wsPedro = wb.Sheets[pedroName];
  if (!wsPedro) throw new Error('Aba "Pedro" inválida');
  const pedroRooms = parseWorksheet(wsPedro);

  const oficialName = findSheetNameCI(names, "Oficial");
  if (!oficialName) {
    return pedroRooms;
  }
  const wsOf = wb.Sheets[oficialName];
  if (!wsOf) return pedroRooms;
  const oficialRooms = parseWorksheet(wsOf);
  return mergeOfficialVendidosIntoBase(pedroRooms, oficialRooms);
}

/**
 * Lê uma única aba pelo nome (comparação sem acento de maiúsculas).
 * Útil para testes ou ficheiros só com uma folha.
 */
export function parseTreeTowerXlsxSingleSheet(buffer: Buffer, sheetName: string): SeedRoom[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const resolved = findSheetNameCI(wb.SheetNames, sheetName);
  if (!resolved) throw new Error(`Aba não encontrada: ${sheetName}`);
  const ws = wb.Sheets[resolved];
  if (!ws) throw new Error("Aba inválida");
  return parseWorksheet(ws);
}

/**
 * @deprecated Preferir `buildSeedFromPedroAndOficialWorkbook` (Pedro + Oficial).
 * Mantido para compat: delega para o fluxo completo com abas Pedro/Oficial.
 */
export function parseTreeTowerXlsxBuffer(buffer: Buffer): SeedRoom[] {
  return buildSeedFromPedroAndOficialWorkbook(buffer);
}
