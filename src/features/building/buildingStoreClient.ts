"use client";

import { create } from "zustand";
import type { AppMode } from "@/lib/appMode";
import type {
  BuildingSnapshot,
  NotificationEvent,
  RoomStatus,
  RoomStatusChangedEvent,
} from "@/lib/buildingTypes";
import type { ClientAuthRole } from "@/lib/authUi";

type Filters = {
  status: RoomStatus | "all";
  floor: number | "all";
  search: string;
};

type BuildingStoreClient = {
  building: BuildingSnapshot | null;
  /** Sincronizado com o servidor (APP_MODE). */
  appMode: AppMode;
  /** `true` quando AUTH_SECRET está definido (mostrar Sair). */
  authEnabled: boolean;
  /** `viewer` = visitante; `secretaria` = vendas (sem relatórios); `gestor` = gestão completa. */
  authRole: ClientAuthRole;
  /** Nome da sessão (ex.: Lariele, Pedro). */
  authName: string | null;

  // UI
  selectedFloor: number | null;
  selectedRoomId: number | null;
  roomModalOpen: boolean;
  drawerOpen: boolean;

  filters: Filters;

  // Tempo real (SSE)
  realtime: {
    connected: boolean;
    lastEventAt: number | null;
    lastError: string | null;
  };

  notifications: NotificationEvent[];

  // Actions
  setBuilding: (
    snapshot: BuildingSnapshot,
    appMode: AppMode,
    authEnabled?: boolean,
    authRole?: ClientAuthRole,
    authName?: string | null
  ) => void;
  applyEvent: (evt: RoomStatusChangedEvent) => void;
  setSelectedFloor: (floor: number | null) => void;
  openRoom: (roomId: number) => void;
  closeRoomModal: () => void;
  setDrawerOpen: (open: boolean) => void;
  setFilters: (partial: Partial<Filters>) => void;
  addNotifications: (events: NotificationEvent[]) => void;
  clearNotifications: () => void;
  setRealtime: (partial: Partial<BuildingStoreClient["realtime"]>) => void;
};

export const useBuildingStoreClient = create<BuildingStoreClient>((set, get) => ({
  building: null,
  appMode: "edit",
  authEnabled: false,
  authRole: null,
  authName: null,

  selectedFloor: null,
  selectedRoomId: null,
  roomModalOpen: false,
  drawerOpen: false,

  filters: { status: "all", floor: "all", search: "" },

  realtime: { connected: false, lastEventAt: null, lastError: null },
  notifications: [],

  setBuilding: (snapshot, appMode, authEnabled = false, authRole = null, authName = null) =>
    set(() => ({
      building: snapshot,
      appMode,
      authEnabled,
      authRole: authRole ?? null,
      authName: authName ?? null,
      selectedFloor: null,
      selectedRoomId: null,
      roomModalOpen: false,
      drawerOpen: false,
      notifications: snapshot.notifications ?? [],
      realtime: { connected: get().realtime.connected, lastEventAt: null, lastError: null },
    })),

  applyEvent: (evt) =>
    set((state) => {
      if (!state.building) return state;
      const building = state.building;
      const room = building.roomsById[evt.roomId];
      if (room) {
        room.status = evt.newStatus;
        room.lastUpdatedAt = evt.updatedAt;
        room.history.unshift(evt.historyEntry);
        room.history = room.history.slice(0, 60);
      }

      building.floorAggregates[evt.floor] = evt.floorAggregate;
      building.summary = evt.summary;

      const nextNotifications = [...evt.notifications, ...state.notifications].slice(0, 25);
      return {
        ...state,
        building: { ...building, floorAggregates: { ...building.floorAggregates }, roomsById: { ...building.roomsById }, summary: evt.summary },
        notifications: nextNotifications,
        realtime: { ...state.realtime, lastEventAt: evt.updatedAt, lastError: null },
      };
    }),

  setSelectedFloor: (floor) =>
    set(() => ({
      selectedFloor: floor,
      drawerOpen: floor !== null,
      roomModalOpen: false,
      selectedRoomId: null,
    })),

  openRoom: (roomId) =>
    set(() => ({
      selectedRoomId: roomId,
      roomModalOpen: true,
      // drawer pode continuar aberto
    })),

  closeRoomModal: () =>
    set(() => ({
      roomModalOpen: false,
      selectedRoomId: null,
    })),

  setDrawerOpen: (open) => set(() => ({ drawerOpen: open, selectedFloor: open ? get().selectedFloor : null })),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),

  addNotifications: (events) =>
    set((state) => ({
      notifications: [...events, ...state.notifications].slice(0, 25),
    })),

  clearNotifications: () => set(() => ({ notifications: [] })),

  setRealtime: (partial) =>
    set((state) => ({ realtime: { ...state.realtime, ...partial } })),
}));

