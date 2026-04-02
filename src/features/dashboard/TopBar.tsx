"use client";

import { useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";
import type { NotificationEvent, RoomStatusChangedEvent, RoomStatus } from "@/lib/buildingTypes";
import { formatRelativeDateTime } from "@/lib/time";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";

type Props = {
  notifications: NotificationEvent[];
  onClearNotifications: () => void;
  onOpenRoom: (roomId: number) => void;
  onSetFilters: (partial: { status?: RoomStatus | "all"; floor?: number | "all"; search?: string }) => void;
};

export function TopBar({ notifications, onClearNotifications, onOpenRoom, onSetFilters }: Props) {
  const { building, filters } = useBuildingStoreClient();
  const [query, setQuery] = useState(filters.search);
  const [openNotif, setOpenNotif] = useState(false);

  const suggestions = useMemo(() => {
    if (!building) return [];
    const q = query.trim();
    if (!q) return [];
    const id = Number(q);
    if (!Number.isFinite(id)) return [];
    const room = building.roomsById[id];
    if (!room) return [];
    return [room];
  }, [building, query]);

  const list = notifications.slice(0, 12);

  return (
    <header className="flex w-full items-center justify-between gap-3 border-b border-white/10 bg-slate-950/45 p-3 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <div className="text-base font-semibold text-slate-100">Prédio 3D</div>
        <div className="hidden text-xs text-slate-400 sm:block">Gerenciamento de salas</div>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative w-full max-w-[520px]">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Search size={16} />
          </div>
          <input
            id="room-search"
            name="search"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              onSetFilters({ search: v });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length > 0) {
                onOpenRoom(suggestions[0].id);
              }
            }}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/30 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500/60"
            placeholder="Buscar sala (ex: 205)"
          />

          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl">
              {suggestions.map((r) => (
                <button
                  key={`sug-${r.id}`}
                  onClick={() => onOpenRoom(r.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-sky-500/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">Sala {r.id}</span>
                    <span className="text-xs text-slate-400">Andar {r.floor}</span>
                  </div>
                  <span className="text-xs text-slate-300">
                    {STATUS_META[r.status].emoji} {STATUS_META[r.status].label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setOpenNotif((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/30 text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10"
            aria-label="Notificações"
          >
            <Bell size={18} />
          </button>

          {openNotif && (
            <div className="absolute right-0 top-full z-40 mt-2 w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div className="text-sm font-semibold text-slate-100">Notificações</div>
                <button
                  onClick={() => onClearNotifications()}
                  className="text-xs text-slate-300 hover:text-slate-50"
                >
                  Limpar
                </button>
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                {list.length === 0 && (
                  <div className="px-3 py-3 text-sm text-slate-400">Nenhum evento recente.</div>
                )}
                {list.map((n) => (
                  <div key={n.id} className="px-3 py-2 hover:bg-white/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-100">{n.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-300">{n.message}</div>
                      </div>
                      <div className="shrink-0 text-[11px] text-slate-400">
                        {formatRelativeDateTime(n.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/30 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-sky-500/70 to-indigo-500/70 shadow-[0_0_30px_rgba(56,189,248,0.25)]" />
          <div className="hidden text-sm font-semibold text-slate-100 md:block">Admin</div>
        </div>
      </div>
    </header>
  );
}

