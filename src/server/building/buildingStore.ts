import type {
  BuildingSnapshot,
  FloorAggregate,
  NotificationEvent,
  RoomRecord,
  RoomStatus,
  RoomStatusChangedEvent,
  SummaryCounts,
  StatusSalaHistoryEntry,
} from "@/lib/buildingTypes";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import {
  looksLikeRentedStatusSala,
  looksLikeSoldStatusSala,
  normalizeStatusSala,
  statusSalaRequiresFechamentoCompleto,
  statusSalaShowsDataVendaField,
} from "@/lib/treeTowerStatusSala";
import type { SeedRoom } from "./generateBuilding";
import {
  generateBuildingFromSeed,
  generateInitialBuilding,
  mergeSeedDataVendaIntoSnapshot,
  normalizeSnapshotDataVendaEpoch,
} from "./generateBuilding";
import { loadPersistedSnapshotAsync, savePersistedSnapshotUniversal } from "./loadPersisted";
import { isPersistenceEnabled } from "./persistBuildingState";
import { awaitPostgresPersistenceQueue, loadFromPostgres } from "./persistPostgres";
/**
 * Estado inicial opcional (`treeTowerSeed.json`): com seed, layout (salas/área/posição na planta) é fixo.
 * Dados de negócio (`meta`, incl. `dataVenda` em ms) vivem na persistência (ficheiro ou Postgres) depois
 * do primeiro arranque: alteram-se na app (modal/cartões + API PATCH) e mantêm-se entre reinícios.
 */
import seedRooms from "./treeTowerSeed.json";

type Listener = (evt: RoomStatusChangedEvent) => void;

type Store = {
  state: BuildingSnapshot;
  listeners: Set<Listener>;
  updateRoomStatus: (
    roomId: number,
    newStatus: RoomStatus,
    by: string,
    opts?: { reserveBy?: { name: string; login: string } }
  ) => RoomStatusChangedEvent;
  createRooms: (args: { floor: number; status: RoomStatus; count: number; area: number; namePrefix: string; by: string; planSlot?: string }) => RoomRecord[];
  updateRoomDetails: (args: {
    roomId: number;
    name?: string;
    area?: number;
    by: string;
    planSlot?: string;
    statusSala?: string;
    valorImovel?: number | null;
    valorM2?: number | null;
    precificacao?: string | null;
    faixa?: string | null;
    baseCalculoVenda?: number | null;
    corretor?: string | null;
    imobiliaria?: string | null;
    comprador?: string | null;
    formaPagamento?: string | null;
    prazoPagamento?: string | null;
    valorVenda?: number | null;
    descontos?: number | null;
    /** Data da venda (epoch ms) — usada em “Vendas por período”. */
    dataVenda?: number | null;
    /** Preenchido pelo servidor ao entrar em reservada (quem registou). */
    reserveBy?: { name: string; login: string };
  }) => RoomRecord;
  deleteRoom: (args: { roomId: number; by: string }) => { ok: true; deletedRoomId: number; floor: number };
  subscribe: (listener: Listener) => () => void;
  getState: () => BuildingSnapshot;
  /** Substitui todo o estado em memória (ex.: import administrativo). Não grava disco/BD — use `persistSnapshotNow` depois. */
  replaceSnapshotFromImport: (snapshot: BuildingSnapshot) => void;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function createNotification(type: NotificationEvent["type"], title: string, message: string): NotificationEvent {
  return {
    id: uid(),
    type,
    title,
    message,
    at: Date.now(),
  };
}

function operationalStatusFromStatusSala(statusSala: string): RoomStatus {
  const u = statusSala.trim().toUpperCase();
  if (u === "INDISPONIVEL" || u === "INDISPONÍVEL") return "ocupada";
  if (looksLikeSoldStatusSala(statusSala) || looksLikeRentedStatusSala(statusSala)) return "ocupada";
  if (u.includes("RESERV")) return "reservada";
  if (u.includes("MANUT")) return "manutencao";
  if (u.includes("DBN")) return "reservada";
  if (u.includes("ATACADO") || u.includes("AUDIT") || u.includes("ROOFTOP")) return "manutencao";
  return "disponivel";
}

function startAutoSimulation(store: Store) {
  // Para demonstrar "tempo real": a cada alguns segundos, altera uma sala aleatória.
  // Em produção isso viria de um banco + processos reais.
  const intervalMs = 4500;
  setInterval(() => {
    const state = store.state;
    const roomIds = Object.keys(state.roomsById).map((k) => Number(k));
    if (roomIds.length === 0) return;

    const roomId = roomIds[Math.floor(Math.random() * roomIds.length)];
    const room = state.roomsById[roomId];
    if (!room) return;

    // Probabilidades direcionadas para gerar eventos visíveis
    const current = room.status;
    const r = Math.random();

    let next: RoomStatus = current;
    if (current === "disponivel") {
      if (r < 0.35) next = "ocupada";
      else if (r < 0.5) next = "reservada";
      else if (r < 0.55) next = "manutencao";
    } else if (current === "reservada") {
      if (r < 0.4) next = "ocupada";
      else if (r < 0.7) next = "disponivel";
      else if (r < 0.78) next = "manutencao";
    } else if (current === "ocupada") {
      if (r < 0.3) next = "disponivel";
      else if (r < 0.55) next = "reservada";
      else if (r < 0.6) next = "manutencao";
    } else {
      // manutencao
      if (r < 0.6) next = "disponivel";
      else if (r < 0.75) next = "reservada";
      else next = "ocupada";
    }

    if (next !== current) {
      try {
        store.updateRoomStatus(roomId, next, "sistema");
      } catch {
        // ignore
      }
    }
  }, intervalMs);
}

async function createStore(): Promise<Store> {
  const hasSeed = Array.isArray(seedRooms) && seedRooms.length > 0;
  const persisted = await loadPersistedSnapshotAsync();
  const initialState =
    persisted ??
    (hasSeed
      ? generateBuildingFromSeed(seedRooms)
      : generateInitialBuilding({
          floors: 16,
          totalRooms: 0,
          startingRoomId: 101,
        }));

  const state = initialState;
  normalizeSnapshotDataVendaEpoch(state);
  let mergedSeedDates = false;
  if (persisted && hasSeed) {
    mergedSeedDates = mergeSeedDataVendaIntoSnapshot(state, seedRooms as SeedRoom[]);
    if (mergedSeedDates) normalizeSnapshotDataVendaEpoch(state);
  }

  const persist = () => {
    savePersistedSnapshotUniversal(state);
  };
  if (mergedSeedDates && isPersistenceEnabled()) {
    persist();
  }

  const listeners = new Set<Listener>();

  const nextRoomId = () => {
    const ids = Object.keys(state.roomsById).map((k) => Number(k));
    const max = ids.length ? Math.max(...ids) : 0;
    return max + 1;
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const emit = (evt: RoomStatusChangedEvent) => {
    // `listeners` é um `Set` e o `tsconfig` do projeto não habilita
    // `downlevelIteration`, então evitamos `for...of`.
    listeners.forEach((l) => l(evt));
  };

  const getState = () => state;

  const createRoomsImpl = ({
    floor,
    status,
    count,
    area,
    namePrefix,
    by,
    planSlot,
  }: {
    floor: number;
    status: RoomStatus;
    count: number;
    area: number;
    namePrefix: string;
    by: string;
    planSlot?: string;
  }) => {
    if (!Number.isFinite(floor)) throw new Error("floor inválido");
    if (!Number.isFinite(count) || count <= 0) throw new Error("count inválido");
    if (!Number.isFinite(area) || area <= 0) throw new Error("area inválida");
    if (hasSeed) {
      throw new Error(
        "Não é possível criar novas salas: o layout da torre vem da importação (plantas/Excel) e o cadastro de vãos é fixo."
      );
    }

    const floorAgg = state.floorAggregates[floor];
    if (!floorAgg) throw new Error("Andar não encontrado");

    if (!state.floors[floor]) state.floors[floor] = [];
    if (planSlot && count !== 1) throw new Error("planSlot só pode ser usado com criação unitária");
    if (planSlot) {
      const occupied = Object.values(state.roomsById).some((r) => r.floor === floor && r.planSlot === planSlot);
      if (occupied) throw new Error("Este slot da planta já está vinculado a outra sala");
    }

    const created: RoomRecord[] = [];
    for (let i = 0; i < count; i++) {
      const id = nextRoomId();
      const at = Date.now();

      const room: RoomRecord = {
        id,
        floor,
        status,
        name: `${namePrefix} ${String(id).padStart(4, "0")}`,
        area,
        planSlot: count === 1 ? planSlot : undefined,
        lastUpdatedAt: at,
        history: [
          {
            at,
            by,
            from: "init",
            to: status,
            reason: "criação de sala",
          },
        ],
      };

      state.roomsById[id] = room;
      state.floors[floor].push(id);

      floorAgg.counts[status] += 1;
      floorAgg.totalRooms += 1;

      state.summary.counts[status] += 1;
      state.summary.totalRooms += 1;

      created.push(room);
    }

    persist();
    return created;
  };

  const updateRoomDetailsImpl = ({
    roomId,
    name,
    area,
    by,
    planSlot,
    statusSala,
    valorImovel,
    valorM2,
    precificacao,
    faixa,
    baseCalculoVenda,
    corretor,
    imobiliaria,
    comprador,
    formaPagamento,
    prazoPagamento,
    valorVenda,
    descontos,
    dataVenda,
    reserveBy,
  }: {
    roomId: number;
    name?: string;
    area?: number;
    by: string;
    planSlot?: string;
    statusSala?: string;
    valorImovel?: number | null;
    valorM2?: number | null;
    precificacao?: string | null;
    faixa?: string | null;
    baseCalculoVenda?: number | null;
    corretor?: string | null;
    imobiliaria?: string | null;
    comprador?: string | null;
    formaPagamento?: string | null;
    prazoPagamento?: string | null;
    valorVenda?: number | null;
    descontos?: number | null;
    dataVenda?: number | null;
    reserveBy?: { name: string; login: string };
  }) => {
    const room = state.roomsById[roomId];
    if (!room) throw new Error("Sala não encontrada");

    const statusAtStart = room.status;
    const wasReserved = statusAtStart === "reservada";
    const statusSalaAtStart = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "").trim();

    const cleanName = typeof name === "string" ? name.trim() : undefined;
    if (cleanName) room.name = cleanName;

    if (hasSeed) {
      if (typeof area === "number" && Number.isFinite(area) && area > 0 && area !== room.area) {
        throw new Error(
          "Não é possível alterar a área da sala: o layout da torre vem da importação (plantas/Excel) e este dado é fixo."
        );
      }
      if (typeof planSlot === "string") {
        const cleanSlot = planSlot.trim();
        const nextNorm = cleanSlot || undefined;
        const curNorm = room.planSlot?.trim() || undefined;
        if (nextNorm !== curNorm) {
          throw new Error(
            "Não é possível alterar a posição na planta: o layout da torre vem da importação (plantas/Excel) e este dado é fixo."
          );
        }
      }
    }

    if (typeof area === "number" && Number.isFinite(area) && area > 0) {
      room.area = area;
    }

    if (typeof planSlot === "string") {
      const cleanSlot = planSlot.trim();
      if (cleanSlot) {
        const occupied = Object.values(state.roomsById).some((r) => r.id !== roomId && r.floor === room.floor && r.planSlot === cleanSlot);
        if (occupied) throw new Error("Este slot da planta já está vinculado a outra sala");
      }
      room.planSlot = cleanSlot || undefined;
    }

    if (typeof statusSala === "string") {
      const cleanStatusSala = statusSala.trim();
      if (!cleanStatusSala) throw new Error("Status da sala inválido");

      room.statusSala = cleanStatusSala;
      if (room.meta) room.meta.statusSalaOriginal = cleanStatusSala;
      else room.meta = { statusSalaOriginal: cleanStatusSala };

      // Mantemos o status operacional internamente; o texto de negócio é o STATUS SALA (sistema).
      // Ainda assim, se quiser compatibilidade com o status operacional, mantemos a sincronização.
      const nextOp = operationalStatusFromStatusSala(cleanStatusSala);
      const oldOp = room.status;
      if (nextOp !== oldOp) {
        const floorAgg = state.floorAggregates[room.floor];
        if (floorAgg) {
          floorAgg.counts[oldOp] = Math.max(0, floorAgg.counts[oldOp] - 1);
          floorAgg.counts[nextOp] += 1;
        }
        state.summary.counts[oldOp] = Math.max(0, state.summary.counts[oldOp] - 1);
        state.summary.counts[nextOp] += 1;
        room.status = nextOp;
      }

      const statusSalaNow = cleanStatusSala;
      if (statusSalaNow !== statusSalaAtStart) {
        const entry: StatusSalaHistoryEntry = {
          at: Date.now(),
          by,
          from: statusSalaAtStart || "init",
          to: statusSalaNow,
          reason: "atualização de status da sala",
        };
        room.statusSalaHistory = [entry, ...(room.statusSalaHistory ?? [])].slice(0, 120);
      }
      if (!statusSalaShowsDataVendaField(statusSalaNow) && room.meta?.dataVenda != null) {
        delete room.meta.dataVenda;
      }
    }

    const isReservedNow = room.status === "reservada";
    if (!isReservedNow) {
      if (room.meta) {
        delete room.meta.reservedAt;
        delete room.meta.reservedByName;
        delete room.meta.reservedByLogin;
      }
    } else if (!wasReserved && isReservedNow) {
      if (!room.meta) room.meta = {};
      const rb = reserveBy ?? { name: by, login: "" };
      room.meta.reservedAt = Date.now();
      room.meta.reservedByName = rb.name;
      room.meta.reservedByLogin = rb.login;
    }

    const metaPriceKeys =
      valorImovel !== undefined ||
      valorM2 !== undefined ||
      precificacao !== undefined ||
      faixa !== undefined ||
      baseCalculoVenda !== undefined ||
      corretor !== undefined ||
      imobiliaria !== undefined ||
      comprador !== undefined ||
      formaPagamento !== undefined ||
      prazoPagamento !== undefined ||
      valorVenda !== undefined ||
      descontos !== undefined ||
      dataVenda !== undefined;
    if (metaPriceKeys) {
      if (!room.meta) room.meta = {};
      const m = room.meta;
      if (valorImovel !== undefined) {
        if (valorImovel === null) delete m.valorImovel;
        else m.valorImovel = valorImovel;
      }
      if (valorM2 !== undefined) {
        if (valorM2 === null) delete m.valorM2;
        else m.valorM2 = valorM2;
      }
      if (precificacao !== undefined) {
        if (precificacao === null || precificacao === "") delete m.precificacao;
        else m.precificacao = precificacao;
      }
      if (faixa !== undefined) {
        if (faixa === null || faixa === "") delete m.faixa;
        else m.faixa = faixa;
      }
      if (baseCalculoVenda !== undefined) {
        if (baseCalculoVenda === null) delete m.baseCalculoVenda;
        else m.baseCalculoVenda = baseCalculoVenda;
      }
      const strOrDel = (key: "corretor" | "imobiliaria" | "comprador" | "formaPagamento" | "prazoPagamento", v: string | null | undefined) => {
        if (v === undefined) return;
        if (v === null || v === "") delete m[key];
        else m[key] = v;
      };
      strOrDel("corretor", corretor);
      strOrDel("imobiliaria", imobiliaria);
      strOrDel("comprador", comprador);
      strOrDel("formaPagamento", formaPagamento);
      strOrDel("prazoPagamento", prazoPagamento);
      if (valorVenda !== undefined) {
        if (valorVenda === null) delete m.valorVenda;
        else m.valorVenda = valorVenda;
      }
      if (descontos !== undefined) {
        if (descontos === null) delete m.descontos;
        else m.descontos = descontos;
      }
      if (dataVenda !== undefined) {
        if (dataVenda === null) delete m.dataVenda;
        else m.dataVenda = dataVenda;
      }
    }

    const statusSalaFinal = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "").trim();
    if (statusSalaRequiresFechamentoCompleto(statusSalaFinal)) {
      const m = room.meta;
      const parts: string[] = [];
      if (!String(m?.comprador ?? "").trim()) parts.push("comprador ou locatário");
      if (!String(m?.imobiliaria ?? "").trim()) parts.push("imobiliária");
      if (!String(m?.corretor ?? "").trim()) parts.push("corretor");
      if (typeof m?.dataVenda !== "number" || !Number.isFinite(m.dataVenda) || m.dataVenda <= 0) {
        parts.push("data (venda ou início do aluguel)");
      }
      if (parts.length) {
        throw new Error(`Para VENDIDO ou ALUGADA, preencha: ${parts.join(", ")}.`);
      }
    }

    // registra histórico (inclui transição quando o status operacional muda por causa do STATUS SALA)
    room.history.unshift({
      at: Date.now(),
      by,
      from: statusAtStart,
      to: room.status,
      reason: typeof statusSala === "string" ? "atualização de status da sala" : "atualização de detalhes",
    });
    room.history = room.history.slice(0, 60);

    room.lastUpdatedAt = Date.now();

    persist();
    return room;
  };

  const deleteRoomImpl = ({
    roomId,
    by,
  }: {
    roomId: number;
    by: string;
  }) => {
    const room = state.roomsById[roomId];
    if (!room) throw new Error("Sala não encontrada");
    if (hasSeed) {
      throw new Error(
        "Não é possível excluir salas: o layout da torre vem da importação (plantas/Excel) e o cadastro de vãos é fixo."
      );
    }

    const floor = room.floor;
    const floorAgg = state.floorAggregates[floor];
    if (!floorAgg) throw new Error("Andar não encontrado");

    delete state.roomsById[roomId];
    state.floors[floor] = (state.floors[floor] ?? []).filter((id) => id !== roomId);

    floorAgg.counts[room.status] = Math.max(0, floorAgg.counts[room.status] - 1);
    floorAgg.totalRooms = Math.max(0, floorAgg.totalRooms - 1);

    state.summary.counts[room.status] = Math.max(0, state.summary.counts[room.status] - 1);
    state.summary.totalRooms = Math.max(0, state.summary.totalRooms - 1);

    state.notifications.unshift(
      createNotification(
        "sala_alterada",
        `Sala ${room.id} excluída`,
        `${STATUS_META[room.status].label} removida por ${by}.`
      )
    );
    state.notifications = state.notifications.slice(0, 25);

    persist();
    return { ok: true as const, deletedRoomId: roomId, floor };
  };

  const updateRoomStatus = (
    roomId: number,
    newStatus: RoomStatus,
    by: string,
    opts?: { reserveBy?: { name: string; login: string } }
  ): RoomStatusChangedEvent => {
    const room = state.roomsById[roomId];
    if (!room) throw new Error("Sala não encontrada");
    if (room.status === newStatus) {
      // Não gera evento; preserva performance.
      return {
        type: "room_status_changed",
        roomId,
        floor: room.floor,
        oldStatus: room.status,
        newStatus,
        updatedAt: room.lastUpdatedAt,
        historyEntry: {
          at: room.lastUpdatedAt,
          by,
          from: room.status,
          to: newStatus,
        },
        floorAggregate: state.floorAggregates[room.floor],
        summary: state.summary,
        notifications: [],
      };
    }

    const oldStatus = room.status;
    const statusSalaAtStart = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "").trim();
    const at = Date.now();

    let planilha: RoomStatusChangedEvent["planilha"];

    // Atualiza sala
    room.status = newStatus;
    room.lastUpdatedAt = at;
    room.history.unshift({
      at,
      by,
      from: oldStatus,
      to: newStatus,
      reason: "atualização de status",
    });
    room.history = room.history.slice(0, 60);

    /** Alinha STATUS SALA e metadados à reserva (fluxo Salas → RESERVADA). */
    if (newStatus === "reservada" && oldStatus !== "reservada") {
      room.statusSala = "RESERVADA";
      if (!room.meta) room.meta = {};
      room.meta.statusSalaOriginal = "RESERVADA";
      const rb = opts?.reserveBy ?? { name: by, login: "" };
      room.meta.reservedAt = at;
      room.meta.reservedByName = rb.name;
      room.meta.reservedByLogin = rb.login;
      if (statusSalaAtStart !== "RESERVADA") {
        const entry: StatusSalaHistoryEntry = {
          at,
          by,
          from: statusSalaAtStart || "init",
          to: "RESERVADA",
          reason: "reserva (status operacional → STATUS SALA)",
        };
        room.statusSalaHistory = [entry, ...(room.statusSalaHistory ?? [])].slice(0, 120);
      }
      planilha = {
        statusSala: "RESERVADA",
        reservation: {
          reservedAt: at,
          reservedByName: rb.name,
          reservedByLogin: rb.login,
        },
      };
    } else if (oldStatus === "reservada" && newStatus !== "reservada") {
      let statusSalaOut = (room.statusSala ?? statusSalaAtStart).trim() || "ESTOQUE";
      if (normalizeStatusSala(statusSalaAtStart) === "RESERVADA") {
        room.statusSala = "ESTOQUE";
        if (!room.meta) room.meta = {};
        room.meta.statusSalaOriginal = "ESTOQUE";
        statusSalaOut = "ESTOQUE";
        const entry: StatusSalaHistoryEntry = {
          at,
          by,
          from: statusSalaAtStart || "init",
          to: "ESTOQUE",
          reason: "libertação de reserva (status operacional → STATUS SALA)",
        };
        room.statusSalaHistory = [entry, ...(room.statusSalaHistory ?? [])].slice(0, 120);
      }
      if (room.meta) {
        delete room.meta.reservedAt;
        delete room.meta.reservedByName;
        delete room.meta.reservedByLogin;
      }
      planilha = { statusSala: statusSalaOut, reservation: null };
    }

    const floorAgg = state.floorAggregates[room.floor];
    const wasFull = floorAgg.counts["ocupada"] === floorAgg.totalRooms;
    floorAgg.counts[oldStatus] -= 1;
    floorAgg.counts[newStatus] += 1;

    const summary: SummaryCounts = state.summary;
    summary.counts[oldStatus] -= 1;
    summary.counts[newStatus] += 1;

    const notifications: NotificationEvent[] = [];

    notifications.push(
      createNotification(
        "sala_alterada",
        `Sala ${room.id} atualizada`,
        `${STATUS_META[oldStatus].emoji} ${STATUS_META[oldStatus].label} -> ${STATUS_META[newStatus].emoji} ${STATUS_META[newStatus].label}`
      )
    );

    if (oldStatus !== "manutencao" && newStatus === "manutencao") {
      notifications.push(
        createNotification(
          "manutencao_iniciada",
          `Manutenção iniciada (Andar ${room.floor})`,
          `Sala ${room.id} entrou em manutenção.`
        )
      );
    }

    const isNowFull = floorAgg.counts["ocupada"] === floorAgg.totalRooms;
    if (isNowFull && !wasFull) {
      notifications.push(
        createNotification(
          "andar_lotado",
          `Andar ${room.floor} lotado`,
          "Todas as salas do andar estão ocupadas."
        )
      );
    }

    // Mantém um buffer recente para o drawer/notification list
    state.notifications.unshift(...notifications);
    state.notifications = state.notifications.slice(0, 25);

    persist();

    const evt: RoomStatusChangedEvent = {
      type: "room_status_changed",
      roomId,
      floor: room.floor,
      oldStatus,
      newStatus,
      updatedAt: at,
      historyEntry: room.history[0],
      floorAggregate: floorAgg as FloorAggregate,
      summary: state.summary,
      notifications,
      ...(planilha ? { planilha } : {}),
    };

    emit(evt);
    return evt;
  };

  const replaceSnapshotFromImport = (snapshot: BuildingSnapshot) => {
    normalizeSnapshotDataVendaEpoch(snapshot);
    state.floors = snapshot.floors;
    state.roomsById = snapshot.roomsById;
    state.floorAggregates = snapshot.floorAggregates;
    state.summary = snapshot.summary;
    state.notifications = snapshot.notifications ?? [];
  };

  const store: Store = {
    state,
    listeners,
    updateRoomStatus,
    createRooms: createRoomsImpl,
    updateRoomDetails: updateRoomDetailsImpl,
    deleteRoom: deleteRoomImpl,
    subscribe,
    getState,
    replaceSnapshotFromImport,
  };

  return store;
}

export async function getBuildingStore(): Promise<Store> {
  const g = globalThis as unknown as { __buildingStore?: Store; __buildingStoreInit?: Promise<Store> };
  if (g.__buildingStore) return g.__buildingStore;
  if (!g.__buildingStoreInit) {
    g.__buildingStoreInit = createStore().then((store) => {
      g.__buildingStore = store;
      const hasSeed = Array.isArray(seedRooms) && seedRooms.length > 0;
      if (!hasSeed) startAutoSimulation(store);
      return store;
    });
  }
  return g.__buildingStoreInit;
}

/** Antes de mutar: com Postgres, alinha esta instância com a BD (evita sobrescrever com snapshot desatualizado em serverless). */
export async function ensureBuildingStoreSyncedFromDb(): Promise<Store> {
  const store = await getBuildingStore();
  if (!process.env.DATABASE_URL?.trim() || !isPersistenceEnabled()) {
    return store;
  }
  const fresh = await loadFromPostgres();
  if (fresh) {
    store.replaceSnapshotFromImport(fresh);
  }
  return store;
}

/** Após mutação: com Postgres, espera a gravação na fila antes de responder (resposta só após persistir). */
export async function flushBuildingPersistence(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim() || !isPersistenceEnabled()) {
    return;
  }
  await awaitPostgresPersistenceQueue();
}

