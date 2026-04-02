"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RoomStatus } from "@/lib/buildingTypes";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { formatRelativeDateTime } from "@/lib/time";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";

type Props = {
  floor: number;
  open: boolean;
  onClose: () => void;
  onOpenRoom: (roomId: number) => void;
};

export function FloorDrawer({ floor, open, onClose, onOpenRoom }: Props) {
  const { building, filters } = useBuildingStoreClient();
  const [drawerStatus, setDrawerStatus] = useState<RoomStatus | "all">("all");

  const floorAgg = building?.floorAggregates?.[floor];
  const roomIds = useMemo(() => building?.floors?.[floor] ?? [], [building, floor]);

  const effectiveStatus: RoomStatus | "all" = filters.status !== "all" ? filters.status : drawerStatus;

  const rooms = useMemo(() => {
    if (!building) return [];
    return roomIds
      .map((id) => building.roomsById[id])
      .filter(Boolean)
      .filter((r) => (effectiveStatus === "all" ? true : r.status === effectiveStatus))
      .filter((r) => {
        const q = (filters.search ?? "").trim();
        if (!q) return true;
        const id = Number(q);
        if (!Number.isFinite(id)) return true;
        return r.id === id;
      })
      .sort((a, b) => a.id - b.id);
  }, [building, roomIds, effectiveStatus, filters.search]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.25 }}
          className="fixed right-0 top-0 z-50 h-full w-[520px] shrink-0 border-l border-white/10 bg-slate-950/70 backdrop-blur-xl"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-400">📍 Detalhes do Andar</div>
                <div className="text-2xl font-bold text-slate-100">Andar {floor}</div>
                <div className="mt-1 text-sm text-slate-400">
                  Total de salas: <span className="font-semibold text-slate-200">{floorAgg?.totalRooms ?? roomIds.length}</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-2xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10"
              >
                Fechar
              </button>
            </div>

            <div className="border-b border-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-200">Filtrar por status</div>
                <select
                  id="drawer-status"
                  name="drawerStatus"
                  value={drawerStatus}
                  onChange={(e) => setDrawerStatus(e.target.value as RoomStatus | "all")}
                  className="rounded-xl border border-white/10 bg-slate-900/30 p-2 text-sm outline-none focus:border-sky-500/60"
                >
                  <option value="all">Todos</option>
                  {STATUS_ORDER.map((s) => (
                    <option key={`d-${s}`} value={s}>
                      {STATUS_META[s].emoji} {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {STATUS_ORDER.map((s) => {
                  const count = floorAgg?.counts?.[s] ?? 0;
                  return (
                    <div key={`c-${s}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/25 px-3 py-2">
                      <span className="text-slate-300">
                        {STATUS_META[s].emoji} {STATUS_META[s].label}
                      </span>
                      <span className="font-semibold text-slate-100">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 text-sm font-semibold text-slate-200">🧱 Grid de Salas</div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {rooms.map((r) => (
                  <button
                    key={`room-${r.id}`}
                    onClick={() => onOpenRoom(r.id)}
                    className="group rounded-2xl border border-white/10 bg-slate-900/30 p-3 text-left shadow-[0_0_30px_rgba(56,189,248,0.06)] hover:border-sky-500/30 hover:bg-sky-500/10"
                    style={{
                      borderColor: "rgba(255,255,255,0.12)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-100">Sala {r.id}</div>
                        <div className="mt-1 text-xs text-slate-400">Andar {r.floor}</div>
                      </div>
                      <span className="text-lg">{STATUS_META[r.status].emoji}</span>
                    </div>

                    <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/30 px-2 py-1">
                      <div className="text-xs font-semibold text-slate-100">{STATUS_META[r.status].label}</div>
                    </div>

                    <div className="mt-2 text-xs text-slate-400">
                      Atualizado: <span className="text-slate-200">{formatRelativeDateTime(r.lastUpdatedAt)}</span>
                    </div>

                    <div
                      className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5"
                      aria-hidden
                    >
                      <div
                        className="h-full"
                        style={{ width: "100%", backgroundColor: `rgba(${(STATUS_META[r.status].color >> 16) & 255}, ${(STATUS_META[r.status].color >> 8) & 255}, ${STATUS_META[r.status].color & 255}, 0.8)` }}
                      />
                    </div>
                  </button>
                ))}

                {rooms.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-white/10 bg-slate-900/20 p-4 text-sm text-slate-400">
                    Nenhuma sala encontrada com os filtros atuais.
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

