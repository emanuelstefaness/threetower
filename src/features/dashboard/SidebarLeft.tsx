"use client";

import type { SummaryCounts, RoomStatus } from "@/lib/buildingTypes";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { cn } from "@/lib/utils/cn";

type Props = {
  realtime: { connected: boolean; lastEventAt: number | null; lastError: string | null };
  summary: SummaryCounts | null;
  onSetFilters: (partial: { status?: RoomStatus | "all"; floor?: number | "all"; search?: string }) => void;
};

export function SidebarLeft({ realtime, summary, onSetFilters }: Props) {
  const total = summary?.totalRooms ?? 300;
  const counts = summary?.counts ?? {
    disponivel: 0,
    ocupada: 0,
    reservada: 0,
    manutencao: 0,
  };

  const barTotal = Math.max(1, total);

  return (
    <aside className="w-[320px] shrink-0 border-r border-white/10 bg-slate-950/40 backdrop-blur-xl">
      <div className="h-full overflow-y-auto p-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-4 shadow-[0_0_60px_rgba(56,189,248,0.10)]">
          <div className="mb-3 text-sm font-semibold text-slate-200">📊 Resumo Geral</div>
          <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
            <span>Total</span>
            <span className="font-semibold text-slate-200">{total}</span>
          </div>

          <div className="space-y-2">
            {STATUS_ORDER.map((s) => (
              <div key={`sum-${s}`} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{STATUS_META[s].emoji}</span>
                  <span className="text-xs text-slate-300">{STATUS_META[s].label}</span>
                </div>
                <div className="text-sm font-semibold text-slate-100">
                  {counts[s]}
                  <span className="ml-2 text-[11px] font-medium text-slate-400">
                    {Math.round((counts[s] / barTotal) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-slate-200">📈 Distribuição Total</div>
            <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
              {STATUS_ORDER.map((s) => {
                const pct = counts[s] / barTotal;
                return (
                  <div
                    key={`seg-${s}`}
                    style={{
                      width: `${Math.round(pct * 1000) / 10}%`,
                      backgroundColor: `rgba(${(STATUS_META[s].color >> 16) & 255}, ${(STATUS_META[s].color >> 8) & 255}, ${STATUS_META[s].color & 255}, 0.85)`,
                    }}
                    className="h-full"
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">🎛️ Filtros</div>

          <div className="space-y-3">
            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Status</div>
              <select
                id="status-filter"
                name="status"
                onChange={(e) => onSetFilters({ status: e.target.value as RoomStatus | "all" })}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 p-2 text-sm outline-none focus:border-sky-500/60"
                defaultValue="all"
              >
                <option value="all">Todos</option>
                {STATUS_ORDER.map((s) => (
                  <option key={`opt-${s}`} value={s}>
                    {STATUS_META[s].emoji} {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Andar</div>
              <select
                id="floor-filter"
                name="floor"
                onChange={(e) => onSetFilters({ floor: e.target.value === "all" ? "all" : Number(e.target.value) })}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 p-2 text-sm outline-none focus:border-sky-500/60"
                defaultValue="all"
              >
                <option value="all">Todos</option>
                {Array.from({ length: 16 }).map((_, i) => (
                  <option key={`floor-${i + 1}`} value={i + 1}>
                    Andar {i + 1}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-slate-400">Busca de sala (ID)</div>
              <input
                id="room-search-id"
                name="roomIdSearch"
                onChange={(e) => onSetFilters({ search: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 p-2 text-sm outline-none focus:border-sky-500/60"
                placeholder="Ex: 205"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">⚡ Status do Sistema</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">Atualização em tempo real</div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full",
                  realtime.connected ? "bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.35)]" : "bg-rose-400 shadow-[0_0_18px_rgba(244,63,94,0.25)]"
                )}
              />
              <span className="text-xs font-semibold text-slate-100">
                {realtime.connected ? "Conectado" : "Desconectado"}
              </span>
            </div>
          </div>
          {realtime.lastError && <div className="mt-2 text-xs text-rose-300">{realtime.lastError}</div>}
        </div>
      </div>
    </aside>
  );
}

