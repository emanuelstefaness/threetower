"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchBuildingState } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { MinimalUiToggle } from "@/features/ui/MinimalUiToggle";
import { canAccessInbox, canAccessReports } from "@/lib/authUi";
import { formatMoneyBRL } from "@/lib/formatMoney";
import { displayReservedByName, displayReservedForName } from "@/lib/reservedDisplay";
import { colorForStatusSala, isReservaStatusSalaForInbox } from "@/lib/treeTowerStatusSala";

export default function InboxReservedClient() {
  const pathname = usePathname();
  const { building, appMode, authRole, authEnabled, setBuilding, setRealtime } = useBuildingStoreClient();

  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode: mode, authEnabled: ae, authRole: r, authName }) =>
        alive && setBuilding(snapshot, mode, ae, r, authName)
      )
      .catch((e) => alive && setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" }));
    return () => {
      alive = false;
    };
  }, [setBuilding, setRealtime]);

  const reservedRooms = useMemo(() => {
    if (!building) return [];
    return Object.values(building.roomsById)
      .filter((r) => isReservaStatusSalaForInbox(r.statusSala ?? r.meta?.statusSalaOriginal))
      .sort((a, b) => (b.meta?.reservedAt ?? b.lastUpdatedAt) - (a.meta?.reservedAt ?? a.lastUpdatedAt));
  }, [building]);

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
            <Link href="/panel" className={`sb-item ${pathname.startsWith("/panel") ? "active" : ""}`}>
              Painel TV
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
          <div className="sb-section">Caixa de entrada</div>
          <div className="sb-manage">
            <div className="sb-count">{reservedRooms.length} sala{reservedRooms.length !== 1 ? "s" : ""} reservada{reservedRooms.length !== 1 ? "s" : ""}</div>
          </div>
        </aside>

        <main className="main">
          <div>
            <div className="main-title">Salas reservadas</div>
            <div className="main-sub">Mais recentes primeiro.</div>
          </div>

          <div className="manager-wrap" style={{ marginTop: 16 }}>
            {reservedRooms.length === 0 ? (
              <div className="em-readonly-banner" style={{ borderRadius: 12 }}>
                Nenhuma sala reservada neste momento.
              </div>
            ) : (
              <div className="rooms-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {reservedRooms.map((r) => {
                  const ss = r.statusSala ?? r.meta?.statusSalaOriginal ?? "—";
                  const dot = colorForStatusSala(ss);
                  return (
                    <Link
                      key={r.id}
                      href={`/rooms?floor=${r.floor}&room=${r.id}`}
                      className="room-card rc-d"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div className="rc-area">{r.area}m²</div>
                      <div className="rc-num">{r.id}</div>
                      <div className="rc-name">{r.name}</div>
                      <div className="rc-status">
                        <div className="rc-dot" style={{ background: dot }} />
                        {ss}
                      </div>
                      <div className="rc-status" style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                        {formatMoneyBRL(r.meta?.valorImovel)}
                      </div>
                      <div className="rc-status" style={{ marginTop: 8, fontSize: 11, opacity: 0.88, lineHeight: 1.35 }}>
                        <span style={{ color: "rgba(252, 211, 77, 0.95)" }}>Reservado por:</span>{" "}
                        <strong>{displayReservedByName(r.meta)}</strong>
                      </div>
                      <div className="rc-status" style={{ marginTop: 4, fontSize: 11, opacity: 0.88, lineHeight: 1.35 }}>
                        <span style={{ color: "rgba(148, 163, 184, 0.95)" }}>Reservado para:</span>{" "}
                        <strong>{displayReservedForName(r.meta)}</strong>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <MinimalUiToggle />
    </>
  );
}
