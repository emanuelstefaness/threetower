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
import { generateBuildingFromSeed, generateInitialBuilding } from "./generateBuilding";
import { loadPersistedSnapshotAsync, savePersistedSnapshotUniversal } from "./loadPersisted";
/** Dados do empreendimento (copiados da planilha de referência para o repo; sem ligação direta ao Excel em runtime). */
import seedRooms from "./treeTowerSeed.json";

type Listener = (evt: RoomStatusChangedEvent) => void;

type Store = {
  state: BuildingSnapshot;
  listeners: Set<Listener>;
  updateRoomStatus: (roomId: number, newStatus: RoomStatus, by: string) => RoomStatusChangedEvent;
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
    /** Preenchido pelo servidor ao entrar em reservada (quem registou). */
    reserveBy?: { name: string; login: string };
  }) => RoomRecord;
  deleteRoom: (args: { roomId: number; by: string }) => { ok: true; deletedRoomId: number; floor: number };
  subscribe: (listener: Listener) => () => void;
  getState: () => BuildingSnapshot;
  /** Substitui todo o estado em memória (ex.: reimport da planilha). Não grava disco/BD — use `persistSnapshotNow` depois. */
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
  if (u === "VENDIDO") return "ocupada";
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

  const persist = () => {
    savePersistedSnapshotUniversal(state);
  };

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
    if (hasSeed) throw new Error("Não é possível criar novas salas neste empreendimento.");
    if (!Number.isFinite(floor)) throw new Error("floor inválido");
    if (!Number.isFinite(count) || count <= 0) throw new Error("count inválido");
    if (!Number.isFinite(area) || area <= 0) throw new Error("area inválida");

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
    reserveBy?: { name: string; login: string };
  }) => {
    const room = state.roomsById[roomId];
    if (!room) throw new Error("Sala não encontrada");

    const statusAtStart = room.status;
    const wasReserved = statusAtStart === "reservada";
    const statusSalaAtStart = (room.statusSala ?? room.meta?.statusSalaOriginal ?? "").trim();

    const cleanName = typeof name === "string" ? name.trim() : undefined;
    if (hasSeed) {
      if (typeof area === "number" && Number.isFinite(area) && area > 0) {
        throw new Error("A área vem da planilha e não pode ser alterada.");
      }
      if (typeof planSlot === "string") throw new Error("A posição na planta vem da planilha e não pode ser alterada.");
      if (cleanName) room.name = cleanName;
    } else {
      if (cleanName) room.name = cleanName;

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
    }

    if (typeof statusSala === "string") {
      const cleanStatusSala = statusSala.trim();
      if (!cleanStatusSala) throw new Error("Status da sala inválido");

      room.statusSala = cleanStatusSala;
      if (room.meta) room.meta.statusSalaOriginal = cleanStatusSala;
      else room.meta = { statusSalaOriginal: cleanStatusSala };

      // Mantemos o status operacional internamente, mas para o produto o status "correto" é o da planilha.
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
          reason: "atualização de status da sala (planilha)",
        };
        room.statusSalaHistory = [entry, ...(room.statusSalaHistory ?? [])].slice(0, 120);
      }
    }

    const isReservedNow = room.status === "reservada";
    if (!isReservedNow) {
      if (room.meta) {
        delete room.meta.reservedAt;
        delete room.meta.reservedByName;
        delete room.meta.reservedByLogin;
      }
    } else if (!wasReserved && typeof statusSala === "string" && reserveBy) {
      if (!room.meta) room.meta = {};
      room.meta.reservedAt = Date.now();
      room.meta.reservedByName = reserveBy.name;
      room.meta.reservedByLogin = reserveBy.login;
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
      descontos !== undefined;
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
    }

    // registra histórico (inclui transição quando status operacional muda por causa do status da planilha)
    room.history.unshift({
      at: Date.now(),
      by,
      from: statusAtStart,
      to: room.status,
      reason: typeof statusSala === "string" ? "atualização de status da sala (planilha)" : "atualização de detalhes",
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
    if (hasSeed) throw new Error("Não é possível excluir salas neste empreendimento.");
    const room = state.roomsById[roomId];
    if (!room) throw new Error("Sala não encontrada");

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

  const updateRoomStatus = (roomId: number, newStatus: RoomStatus, by: string): RoomStatusChangedEvent => {
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
    const at = Date.now();

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
    };

    emit(evt);
    return evt;
  };

  const replaceSnapshotFromImport = (snapshot: BuildingSnapshot) => {
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

