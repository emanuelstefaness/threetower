"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { fetchBuildingState } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { MinimalUiToggle } from "@/features/ui/MinimalUiToggle";
import RoomFloorWorkbench from "@/features/dashboard/RoomFloorWorkbench";
import { canAccessInbox, canAccessReports } from "@/lib/authUi";

export default function TowerAlfaRoomsClient() {
  const { building, appMode, authRole, authEnabled, setBuilding, applyEvent, setRealtime } = useBuildingStoreClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consumedRoomParam = useRef<string | null>(null);

  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [openRoomRequest, setOpenRoomRequest] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode: mode, authEnabled, authRole, authName }) =>
        alive && setBuilding(snapshot, mode, authEnabled, authRole, authName)
      )
      .catch((e) => alive && setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" }));
    return () => {
      alive = false;
    };
  }, [setBuilding, setRealtime]);

  useEffect(() => {
    const es = new EventSource("/api/events");
    setRealtime({ connected: true, lastError: null });
    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        if (evt?.type === "room_status_changed") applyEvent(evt);
      } catch {
        // ignore
      }
    };
    es.onerror = () => setRealtime({ connected: false, lastError: "Conexão com tempo real perdida" });
    return () => es.close();
  }, [applyEvent, setRealtime]);

  const floors = useMemo(() => {
    if (!building?.floorAggregates) return Array.from({ length: 16 }, (_, i) => i + 1);
    return Object.keys(building.floorAggregates).map(Number).sort((a, b) => a - b);
  }, [building]);

  useEffect(() => {
    if (!building) return;
    const fp = searchParams.get("floor");
    if (!fp) return;
    const n = Number.parseInt(fp, 10);
    if (Number.isFinite(n) && n >= 1) setActiveFloor(n);
  }, [building, searchParams]);

  useEffect(() => {
    if (!building) return;
    const rs = searchParams.get("room");
    if (!rs) {
      consumedRoomParam.current = null;
      setOpenRoomRequest(null);
      return;
    }
    if (consumedRoomParam.current === rs) return;
    const id = Number.parseInt(rs, 10);
    if (!Number.isFinite(id)) return;
    const room = building.roomsById[id];
    if (room) {
      consumedRoomParam.current = rs;
      setActiveFloor(room.floor);
      setOpenRoomRequest(id);
    }
  }, [building, searchParams]);

  const handleOpenRoomRequestHandled = useCallback(() => setOpenRoomRequest(null), []);

  return (
    <>
      <header className="topbar">
        <BrandLogo />
        {appMode === "view" ? (
          <div className="app-mode-pill" title="Edição desativada no servidor">
            Somente leitura
          </div>
        ) : null}
        <AuthLogoutButton />
        <div className="top-spacer" />
      </header>

      <div className="layout rooms-layout">
        <aside className="sidebar">
          <div className="sb-header">Painel</div>
          <div className="sb-nav">
            <Link href="/" className={`sb-item ${pathname === "/" ? "active" : ""}`}>
              Dashboard
            </Link>
            <Link href="/rooms" className={`sb-item ${pathname.startsWith("/rooms") ? "active" : ""}`}>
              Salas
            </Link>
            {canAccessInbox(authRole, authEnabled) ? (
              <Link href="/inbox" className={`sb-item ${pathname.startsWith("/inbox") ? "active" : ""}`}>
                Reservas
              </Link>
            ) : null}
            {canAccessReports(authRole) ? (
              <Link href="/reports" className={`sb-item ${pathname.startsWith("/reports") ? "active" : ""}`}>
                Relatórios
              </Link>
            ) : null}
          </div>
          <div className="sb-divider" />
          <div className="sb-section">Andares</div>
          <div className="sb-manage">
            {floors.map((f) => (
              <div key={f} className={`sb-item ${activeFloor === f ? "active" : ""}`} onClick={() => setActiveFloor(f)}>
                Andar {f}
              </div>
            ))}
          </div>
        </aside>

        <main className="main">
          <div>
            <div className="main-title">Módulo de Salas</div>
            <div className="main-sub">
              {appMode === "view"
                ? "Visualização dos dados por andar e pela planta. Alterações estão desativadas."
                : "Criação, edição e exclusão centralizadas por andar."}
            </div>
          </div>

          <RoomFloorWorkbench
            floor={activeFloor}
            showRoomGrid
            openRoomIdRequest={openRoomRequest}
            onOpenRoomRequestHandled={handleOpenRoomRequestHandled}
          />
        </main>
      </div>

      <MinimalUiToggle />
    </>
  );
}
