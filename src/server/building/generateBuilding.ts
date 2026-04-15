import type {
  BuildingSnapshot,
  FloorAggregate,
  FloorCounts,
  RoomHistoryEntry,
  RoomMeta,
  RoomRecord,
  RoomStatus,
  StatusSalaHistoryEntry,
  SummaryCounts,
} from "@/lib/buildingTypes";
import { STATUS_ORDER, STATUS_META } from "@/lib/status";
import { normalizeStatusSala } from "@/lib/treeTowerStatusSala";
import * as XLSX from "xlsx";

/** Abaixo disto, `meta.dataVenda` legado costuma ser serial Excel (seed), não epoch ms. */
const DATA_VENDA_EPOCH_MS_MIN = 1_000_000_000_000;

/**
 * Converte `meta.dataVenda` de serial Excel para epoch ms (meio-dia local), quando aplicável.
 * Valores já em ms (tipicamente ≥ 2001) mantêm-se. Usado ao hidratar seed ou snapshot persistido.
 */
export function normalizeMetaDataVendaEpochInPlace(meta: RoomMeta | undefined): void {
  if (!meta || typeof meta.dataVenda !== "number" || !Number.isFinite(meta.dataVenda)) return;
  const dv = meta.dataVenda;
  if (dv <= 0 || dv >= DATA_VENDA_EPOCH_MS_MIN) return;
  try {
    const parse = XLSX.SSF?.parse_date_code as ((n: number) => { y: number; m: number; d: number } | null) | undefined;
    const p = parse?.(dv);
    if (p && Number.isFinite(p.y) && Number.isFinite(p.m) && Number.isFinite(p.d)) {
      meta.dataVenda = new Date(p.y, p.m - 1, p.d, 12, 0, 0, 0).getTime();
    }
  } catch {
    /* ignore */
  }
}

export function normalizeSnapshotDataVendaEpoch(snapshot: BuildingSnapshot): void {
  for (const room of Object.values(snapshot.roomsById)) {
    normalizeMetaDataVendaEpochInPlace(room.meta);
  }
}

type Config = {
  floors: number;
  totalRooms: number;
  startingRoomId: number;
};

function xorshift32(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Convert to [0,1)
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

function pickStatus(r: number): RoomStatus {
  // Pesos amigáveis para visual SaaS (com variação visível)
  // disponivel 45%, ocupada 30%, reservada 15%, manutencao 10%
  if (r < 0.45) return "disponivel";
  if (r < 0.75) return "ocupada";
  if (r < 0.9) return "reservada";
  return "manutencao";
}

export function generateInitialBuilding({
  floors,
  totalRooms,
  startingRoomId,
}: Config): BuildingSnapshot {
  const now = Date.now();
  const base = Math.floor(totalRooms / floors);
  const remainder = totalRooms % floors; // primeiras "remainder" faixas têm +1

  const floorsRoomIds: Record<number, number[]> = {};
  const roomsById: Record<number, RoomRecord> = {};
  const floorAggregates: Record<number, FloorAggregate> = {};

  const zeroCounts = (): FloorCounts => ({
    disponivel: 0,
    ocupada: 0,
    reservada: 0,
    manutencao: 0,
  });

  const rng = xorshift32(42);

  let globalRoomIndex = 0;
  const nameTypes = ["Sala Comercial", "Escritório", "Conjunto", "Studio", "Laje", "Suite Exec.", "Coworking"];
  const areaTable = [18, 22, 28, 32, 36, 40, 48, 55, 60, 72];
  for (let floor = 1; floor <= floors; floor++) {
    const roomsCount = floor <= remainder ? base + 1 : base;
    const roomIds: number[] = [];
    const counts = zeroCounts();

    for (let i = 0; i < roomsCount; i++) {
      const roomId = startingRoomId + globalRoomIndex;
      globalRoomIndex++;

      const status = pickStatus(rng());
      const lastUpdatedAt = now - Math.floor(rng() * 1000 * 60 * 60); // até 1h atrás

      const historyEntry: RoomHistoryEntry = {
        at: lastUpdatedAt,
        by: "sistema",
        from: "init",
        to: status,
      };

      const idxInTable = Math.floor(rng() * areaTable.length);
      const area = areaTable[idxInTable] ?? areaTable[0];

      const type = nameTypes[Math.floor(rng() * nameTypes.length)] ?? nameTypes[0];
      const name = `${type} ${floor}-${String(i + 1).padStart(2, "0")}`;

      const room: RoomRecord = {
        id: roomId,
        floor,
        status,
        name,
        area,
        lastUpdatedAt,
        history: [historyEntry],
      };
      roomsById[roomId] = room;
      roomIds.push(roomId);
      counts[status] += 1;
    }

    floorsRoomIds[floor] = roomIds;
    floorAggregates[floor] = {
      floor,
      totalRooms: roomsCount,
      counts,
    };
  }

  const summaryCounts: SummaryCounts = {
    totalRooms,
    counts: zeroCounts(),
  };
  for (const floor of Object.keys(floorAggregates)) {
    const agg = floorAggregates[Number(floor)];
    for (const s of STATUS_ORDER) summaryCounts.counts[s] += agg.counts[s];
  }

  return {
    floors: floorsRoomIds,
    roomsById,
    floorAggregates,
    summary: summaryCounts,
    notifications: [],
  };
}

export type SeedRoom = {
  id: number;
  floor: number;
  status?: string;
  /** STATUS SALA (texto de negócio; pode vir do seed/import). */
  statusSala?: string;
  name: string;
  area: number;
  planSlot?: string;
  meta?: RoomMeta;
};

/**
 * Quando existe snapshot persistido sem `dataVenda` válida mas o seed já traz a data,
 * copia do seed para o estado em memória (e o arranque pode gravar de seguida).
 * Evita que o relatório use só o `lastUpdatedAt`/histórico de importação (todas no mesmo mês).
 */
export function mergeSeedDataVendaIntoSnapshot(snapshot: BuildingSnapshot, seedRooms: SeedRoom[]): boolean {
  const seedById = new Map<number, SeedRoom>();
  for (const sr of seedRooms) {
    if (Number.isFinite(sr.id)) seedById.set(sr.id, sr);
  }
  let changed = false;
  for (const room of Object.values(snapshot.roomsById)) {
    if (normalizeStatusSala(room.statusSala ?? room.meta?.statusSalaOriginal) !== "VENDIDO") continue;
    const seed = seedById.get(room.id);
    const dvSeed = seed?.meta?.dataVenda;
    if (typeof dvSeed !== "number" || !Number.isFinite(dvSeed) || dvSeed <= 0) continue;

    const dv = room.meta?.dataVenda;
    const hasValidMs =
      typeof dv === "number" && Number.isFinite(dv) && dv > 0 && dv >= DATA_VENDA_EPOCH_MS_MIN;
    if (hasValidMs) continue;

    if (!room.meta) room.meta = {};
    room.meta.dataVenda = dvSeed;
    changed = true;
  }
  return changed;
}

export function generateBuildingFromSeed(seedRooms: SeedRoom[]): BuildingSnapshot {
  const now = Date.now();

  const floorsRoomIds: Record<number, number[]> = {};
  const roomsById: Record<number, RoomRecord> = {};
  const floorAggregates: Record<number, FloorAggregate> = {};

  const zeroCounts = (): FloorCounts => ({
    disponivel: 0,
    ocupada: 0,
    reservada: 0,
    manutencao: 0,
  });

  // Indexa por andar
  for (const sr of seedRooms) {
    if (!Number.isFinite(sr.id) || !Number.isFinite(sr.floor)) continue;
    const floor = sr.floor;
    if (!floorsRoomIds[floor]) floorsRoomIds[floor] = [];
    floorsRoomIds[floor].push(sr.id);
  }

  // Inicializa agregados
  for (const floorStr of Object.keys(floorsRoomIds)) {
    const floor = Number(floorStr);
    floorAggregates[floor] = { floor, totalRooms: 0, counts: zeroCounts() };
  }

  // Cria rooms + agregados
  for (const sr of seedRooms) {
    if (!Number.isFinite(sr.id) || !Number.isFinite(sr.floor)) continue;
    const floorAgg = floorAggregates[sr.floor] ?? (floorAggregates[sr.floor] = { floor: sr.floor, totalRooms: 0, counts: zeroCounts() });
    const statusCandidate = typeof sr.status === "string" ? (sr.status as RoomStatus) : undefined;
    const status: RoomStatus = statusCandidate && STATUS_ORDER.includes(statusCandidate) ? statusCandidate : "disponivel";

    const historyEntry: RoomHistoryEntry = {
      at: now,
      by: "import",
      from: "init",
      to: status,
    };

    const statusSalaRaw =
      typeof sr.statusSala === "string" && sr.statusSala.trim()
        ? sr.statusSala.trim()
        : typeof sr.meta?.statusSalaOriginal === "string" && sr.meta.statusSalaOriginal.trim()
          ? sr.meta.statusSalaOriginal.trim()
          : undefined;

    const statusSalaHistoryEntry: StatusSalaHistoryEntry | null = statusSalaRaw
      ? {
          at: now,
          by: "import",
          from: "init",
          to: statusSalaRaw,
          reason: "importação inicial",
        }
      : null;

    const room: RoomRecord = {
      id: sr.id,
      floor: sr.floor,
      status,
      name: sr.name,
      area: sr.area,
      planSlot: sr.planSlot,
      statusSala: statusSalaRaw,
      statusSalaHistory: statusSalaHistoryEntry ? [statusSalaHistoryEntry] : [],
      meta: sr.meta
        ? {
            ...sr.meta,
            ...(statusSalaRaw ? { statusSalaOriginal: statusSalaRaw } : {}),
          }
        : statusSalaRaw
          ? { statusSalaOriginal: statusSalaRaw }
          : undefined,
      lastUpdatedAt: now,
      history: [historyEntry],
    };

    roomsById[room.id] = room;
    floorAgg.totalRooms += 1;
    floorAgg.counts[status] += 1;
  }

  // Ordenação estável por id para UX
  for (const floorStr of Object.keys(floorsRoomIds)) {
    const floor = Number(floorStr);
    floorsRoomIds[floor] = (floorsRoomIds[floor] ?? []).filter((id) => roomsById[id]).sort((a, b) => a - b);
  }

  const summary: SummaryCounts = { totalRooms: 0, counts: zeroCounts() };
  for (const floorStr of Object.keys(floorAggregates)) {
    const agg = floorAggregates[Number(floorStr)];
    summary.totalRooms += agg.totalRooms;
    for (const s of STATUS_ORDER) summary.counts[s] += agg.counts[s];
  }

  return {
    floors: floorsRoomIds,
    roomsById,
    floorAggregates,
    summary,
    notifications: [],
  };
}

