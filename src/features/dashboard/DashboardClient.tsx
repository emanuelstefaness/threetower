"use client";

import { useEffect, useMemo } from "react";
import { fetchBuildingState } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { FloorDrawer } from "@/features/dashboard/FloorDrawer";
import { RoomModal } from "@/features/dashboard/RoomModal";
import { SidebarLeft } from "@/features/dashboard/SidebarLeft";
import { TopBar } from "@/features/dashboard/TopBar";
import { Building3D } from "@/features/building/Building3D";

export default function DashboardClient() {
  const {
    building,
    realtime,
    notifications,
    selectedFloor,
    selectedRoomId,
    roomModalOpen,
    drawerOpen,
    filters,
    setBuilding,
    applyEvent,
    setSelectedFloor,
    openRoom,
    closeRoomModal,
    setFilters,
    clearNotifications,
    setRealtime,
    setDrawerOpen,
  } = useBuildingStoreClient();

  // Carrega snapshot inicial
  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode: mode, authEnabled, authRole, authName }) => {
        if (!alive) return;
        setBuilding(snapshot, mode, authEnabled, authRole, authName);
      })
      .catch((e) => {
        if (!alive) return;
        setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conecta SSE para updates em tempo real
  useEffect(() => {
    const es = new EventSource("/api/events");
    setRealtime({ connected: true, lastError: null });

    es.addEventListener("connected", () => {
      setRealtime({ connected: true, lastError: null });
    });
    es.addEventListener("ping", () => {
      // noop: mantém a conexão
    });

    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        if (evt?.type === "room_status_changed") applyEvent(evt);
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      setRealtime({ connected: false, lastError: "Conexão com tempo real perdida" });
    };

    return () => {
      es.close();
    };
  }, [applyEvent, setRealtime]);

  const closeDrawer = () => setDrawerOpen(false);
  const closeRoom = () => closeRoomModal();

  const summary = useMemo(() => building?.summary ?? null, [building]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_20%,rgba(56,189,248,0.18),transparent_60%),radial-gradient(40%_35%_at_15%_70%,rgba(16,185,129,0.10),transparent_55%),radial-gradient(50%_45%_at_85%_70%,rgba(59,130,246,0.12),transparent_58%)]" />

      <div className="relative z-10 flex h-full">
        <SidebarLeft realtime={realtime} summary={summary} onSetFilters={setFilters} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar notifications={notifications} onClearNotifications={clearNotifications} onOpenRoom={openRoom} onSetFilters={setFilters} />

          <main className="relative flex min-h-0 flex-1 items-stretch">
            <Building3D
              building={building}
              selectedFloor={selectedFloor}
              onSelectFloor={(floor) => {
                setSelectedFloor(floor);
                setDrawerOpen(true);
              }}
              filters={filters}
              onRequestCloseDrawer={closeDrawer}
            />

            {drawerOpen && selectedFloor !== null && (
              <FloorDrawer
                floor={selectedFloor}
                open={drawerOpen}
                onClose={closeDrawer}
                onOpenRoom={openRoom}
              />
            )}

            {roomModalOpen && selectedRoomId !== null && (
              <RoomModal roomId={selectedRoomId} open={roomModalOpen} onClose={closeRoom} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

