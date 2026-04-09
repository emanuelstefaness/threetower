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
import { displayReservedByName, displayReservedForName } from "@/lib/reservedDisplay";
import { colorForStatusSala, isReservaStatusSalaForInbox } from "@/lib/treeTowerStatusSala";

const MS_72H = 72 * 60 * 60 * 1000;

function formatMoneyBRL(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
            <p className="main-sub" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45 }}>
              Lista operacional para gestores. O aviso de 72h é informativo (a reserva não expira automaticamente).
            </p>
          </div>
        </aside>

        <main className="main">
          <div>
            <div className="main-title">Salas reservadas</div>
            <div className="main-sub">Prioridade: mais recentes primeiro. Clique em Salas para abrir o andar e editar.</div>
          </div>

          <div className="manager-wrap" style={{ marginTop: 16 }}>
            {reservedRooms.length === 0 ? (
              <div className="em-readonly-banner" style={{ borderRadius: 12 }}>
                Nenhuma sala com STATUS SALA <strong>RESERVADA</strong> neste momento (DBN e outros não aparecem aqui).
              </div>
            ) : (
              <div className="rooms-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {reservedRooms.map((r) => {
                  const ss = r.statusSala ?? r.meta?.statusSalaOriginal ?? "—";
                  const dot = colorForStatusSala(ss);
                  const at = r.meta?.reservedAt;
                  const over72 = typeof at === "number" && Date.now() - at > MS_72H;
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
                      {over72 ? (
                        <div
                          style={{
                            marginTop: 8,
                            padding: "6px 8px",
                            borderRadius: 8,
                            background: "rgba(245, 158, 11, 0.15)",
                            border: "1px solid rgba(245, 158, 11, 0.35)",
                            fontSize: 11,
                            color: "#fcd34d",
                          }}
                        >
                          Aviso: reserva há mais de 72h (sem expiração automática).
                        </div>
                      ) : null}
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
