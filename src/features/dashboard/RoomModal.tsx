"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RoomStatus } from "@/lib/buildingTypes";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import { formatDateTime, formatRelativeDateTime } from "@/lib/time";
import { updateRoomStatus } from "@/features/building/apiClient";
import { isSecretaria } from "@/lib/authUi";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";

type Props = {
  roomId: number;
  open: boolean;
  onClose: () => void;
};

export function RoomModal({ roomId, open, onClose }: Props) {
  const { building, appMode, authRole, authName } = useBuildingStoreClient();
  const readOnly = appMode === "view";
  const room = building?.roomsById?.[roomId] ?? null;

  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<RoomStatus>("disponivel");
  const [saving, setSaving] = useState(false);

  const history = room?.history ?? [];

  const canOpenEdit = room && room.status;

  const setToStatus = (s: RoomStatus) => setPendingStatus(s);

  const titleStatus = room ? STATUS_META[room.status].label : "";

  const closeAll = () => {
    setEditOpen(false);
    setConfirmOpen(false);
    setSaving(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && room && (
        <>
          {/* Modal de sala */}
          <motion.div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 16, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 16, scale: 0.98 }}
              transition={{ type: "tween", duration: 0.22 }}
              className="w-full max-w-[720px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-[0_0_60px_rgba(56,189,248,0.16)]"
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-400">Modal de sala</div>
                  <div className="mt-1 text-2xl font-bold text-slate-100">Sala {room.id}</div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-300">
                    <span className="text-lg">{STATUS_META[room.status].emoji}</span>
                    <span className="font-semibold text-slate-100">{titleStatus}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-400">Andar {room.floor}</span>
                  </div>
                </div>

                <button
                  onClick={closeAll}
                  className="rounded-2xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10"
                >
                  Fechar
                </button>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-3">
                    <div className="text-sm font-semibold text-slate-200">Última atualização</div>
                    <div className="mt-2 text-sm text-slate-300">
                      <span className="font-semibold text-slate-100">{formatRelativeDateTime(room.lastUpdatedAt)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{formatDateTime(room.lastUpdatedAt)}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-3">
                    <div className="text-sm font-semibold text-slate-200">Ações</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        disabled={!canOpenEdit || readOnly || isSecretaria(authRole)}
                        title={
                          readOnly
                            ? "Modo somente leitura"
                            : isSecretaria(authRole)
                              ? "Secretaria de vendas: use Salas → editar sala e o STATUS SALA (ex.: RESERVADA)."
                              : undefined
                        }
                        onClick={() => {
                          setPendingStatus(room.status === "disponivel" ? "ocupada" : "disponivel");
                          setEditOpen(true);
                        }}
                        className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 hover:border-sky-500/50 hover:bg-sky-500/15 disabled:opacity-50"
                      >
                        Alterar status
                      </button>

                      <button
                        onClick={() => {
                          // Facilita o "histórico" scroll; sem nova UI
                          const el = document.getElementById("room-history");
                          el?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="rounded-2xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10"
                      >
                        Ver histórico
                      </button>
                    </div>
                  </div>
                </div>

                <div id="room-history" className="mt-4">
                  <div className="text-sm font-semibold text-slate-200">Histórico</div>
                  <div className="mt-2 space-y-2">
                    {history.length === 0 && (
                      <div className="rounded-2xl border border-white/10 bg-slate-900/20 p-4 text-sm text-slate-400">
                        Sem histórico.
                      </div>
                    )}
                    {history.map((h, idx) => (
                      <div
                        key={`h-${room.id}-${idx}`}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/30 p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm text-slate-200">
                            <span className="text-sm text-slate-400">{h.from === "init" ? "init" : STATUS_META[h.from as RoomStatus].emoji}</span>
                            <span className="font-semibold text-slate-100">
                              {h.from === "init" ? "Inicial" : STATUS_META[h.from as RoomStatus].label} {" -> "}
                              {STATUS_META[h.to].label}
                            </span>
                          </div>
                          {h.reason && <div className="mt-1 text-xs text-slate-400">{h.reason}</div>}
                        </div>
                        <div className="shrink-0 text-[11px] text-slate-400">
                          {formatRelativeDateTime(h.at)}{" "}
                          <span className="block text-[10px]">{formatDateTime(h.at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Modal de edição */}
          <AnimatePresence>
            {editOpen && (
              <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div
                  initial={{ y: 18, scale: 0.98 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: 18, scale: 0.98 }}
                  transition={{ type: "tween", duration: 0.22 }}
                  className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-[0_0_60px_rgba(56,189,248,0.16)]"
                >
                  <div className="border-b border-white/10 p-4">
                    <div className="text-sm font-semibold text-slate-200">Modal de edição</div>
                    <div className="mt-1 text-xl font-bold text-slate-100">Alterar status da Sala {room.id}</div>
                  </div>

                  <div className="p-4">
                    <label className="block">
                      <div className="mb-1 text-xs text-slate-400">Novo status</div>
                      <select
                        id="pending-status"
                        name="pendingStatus"
                        value={pendingStatus}
                        onChange={(e) => setToStatus(e.target.value as RoomStatus)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/30 p-2 text-sm outline-none focus:border-sky-500/60"
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={`st-${s}`} value={s}>
                            {STATUS_META[s].emoji} {STATUS_META[s].label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditOpen(false)}
                        className="rounded-2xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => setConfirmOpen(true)}
                        className="rounded-2xl bg-sky-500/15 px-3 py-2 text-sm text-slate-100 hover:bg-sky-500/25 border border-sky-500/40"
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Modal de confirmação */}
          <AnimatePresence>
            {confirmOpen && (
              <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div
                  initial={{ y: 18, scale: 0.98 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: 18, scale: 0.98 }}
                  transition={{ type: "tween", duration: 0.22 }}
                  className="w-full max-w-[520px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-[0_0_60px_rgba(56,189,248,0.16)]"
                >
                  <div className="border-b border-white/10 p-4">
                    <div className="text-sm font-semibold text-slate-200">Confirmar ação</div>
                    <div className="mt-1 text-xl font-bold text-slate-100">
                      Aplicar status: {STATUS_META[pendingStatus].emoji} {STATUS_META[pendingStatus].label}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      Sala {room.id} (Andar {room.floor})
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-3 text-sm text-slate-300">
                      Essa alteração aparecerá em tempo real no prédio 3D e será registrada no histórico da sala.
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        disabled={saving}
                        onClick={() => setConfirmOpen(false)}
                        className="rounded-2xl border border-white/10 bg-slate-900/30 px-3 py-2 text-sm text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            await updateRoomStatus(room.id, pendingStatus, authName?.trim() || "Gestor");
                            setConfirmOpen(false);
                            setEditOpen(false);
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="rounded-2xl bg-sky-500/15 px-3 py-2 text-sm text-slate-100 hover:bg-sky-500/25 border border-sky-500/40 disabled:opacity-50"
                      >
                        {saving ? "Salvando..." : "Confirmar"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

