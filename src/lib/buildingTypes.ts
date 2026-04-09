export type RoomStatus = "disponivel" | "ocupada" | "reservada" | "manutencao";

export type RoomMeta = {
  andar?: string;
  numeroAndar?: number;
  unidade?: string;
  escrituras?: string;
  posicao?: string;
  matricula?: string;
  controle?: string;
  areaCobertaM2?: number;
  areaDescobertaM2?: number;
  areaPrivativaM2?: number;
  baseCalculoVenda?: number;
  precificacao?: string;
  faixa?: string;
  valorM2?: number;
  valorImovel?: number;
  statusSalaOriginal?: string;
  /** Venda (ex.: STATUS SALA = VENDIDO). */
  corretor?: string;
  imobiliaria?: string;
  comprador?: string;
  /** Não enviado ao visitante na API (só gestor). */
  formaPagamento?: string;
  prazoPagamento?: string;
  valorVenda?: number;
  descontos?: number;
  dataVenda?: number;
  competencia?: number;
  /** Momento em que a sala passou a reservada (epoch ms). */
  reservedAt?: number;
  /** Quem registou a reserva (nome). */
  reservedByName?: string;
  /** Login interno (gestor/secretaria). */
  reservedByLogin?: string;
};

export type StatusSalaHistoryEntry = {
  at: number; // epoch ms
  by: string;
  from: string | "init";
  to: string;
  reason?: string;
};

export type RoomHistoryEntry = {
  at: number; // epoch ms
  by: string;
  from: RoomStatus | "init";
  to: RoomStatus;
  reason?: string;
};

export type RoomRecord = {
  id: number;
  floor: number;
  status: RoomStatus;
  name: string;
  area: number;
  planSlot?: string;
  /** Status exatamente como na planilha (STATUS SALA); editável na UI. */
  statusSala?: string;
  /** Histórico de alterações do status da planilha. */
  statusSalaHistory?: StatusSalaHistoryEntry[];
  meta?: RoomMeta;
  lastUpdatedAt: number;
  history: RoomHistoryEntry[];
};

export type FloorCounts = Record<RoomStatus, number>;

export type FloorAggregate = {
  floor: number;
  totalRooms: number;
  counts: FloorCounts;
};

export type SummaryCounts = {
  totalRooms: number;
  counts: FloorCounts;
};

export type NotificationType = "sala_alterada" | "andar_lotado" | "manutencao_iniciada";

export type NotificationEvent = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  at: number;
};

export type RoomStatusChangedEvent = {
  type: "room_status_changed";
  roomId: number;
  floor: number;
  oldStatus: RoomStatus;
  newStatus: RoomStatus;
  updatedAt: number;
  historyEntry: RoomHistoryEntry;
  floorAggregate: FloorAggregate;
  summary: SummaryCounts;
  notifications: NotificationEvent[];
};

export type BuildingSnapshot = {
  floors: Record<number, number[]>; // floor -> roomIds
  roomsById: Record<number, RoomRecord>;
  floorAggregates: Record<number, FloorAggregate>;
  summary: SummaryCounts;
  notifications: NotificationEvent[]; // recent events
};

