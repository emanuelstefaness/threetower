"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import {
  canAccessHistorico,
  canAccessInbox,
  canAccessReports,
  canAccessTvPanel,
  isAdminGestor,
} from "@/lib/authUi";

const SEEN_KEY = "treeTower.reservasSeenAt";

/** Conta salas RESERVADAS cuja reserva é mais recente que a última visita à caixa. */
function countNewReservas(roomsById: Record<string, any>, seenAt: number): number {
  let n = 0;
  for (const r of Object.values(roomsById)) {
    const ss = (r?.statusSala ?? r?.meta?.statusSalaOriginal ?? "").trim().toUpperCase();
    if (ss === "RESERVADA" && Number(r?.meta?.reservedAt ?? 0) > seenAt) n++;
  }
  return n;
}

/**
 * Navegação lateral compartilhada por todas as telas.
 * Mostra um aviso (badge) na aba "Reservas" quando há reservas novas e a aba "Histórico".
 */
export function SidebarNav() {
  const pathname = usePathname() || "";
  const { authRole, authEnabled, authLogin } = useBuildingStoreClient();
  const [novas, setNovas] = useState(0);

  // Ao abrir a caixa de Reservas, marca como vistas (zera o aviso).
  useEffect(() => {
    if (pathname.startsWith("/inbox")) {
      try {
        localStorage.setItem(SEEN_KEY, String(Date.now()));
      } catch {}
      setNovas(0);
    }
  }, [pathname]);

  // Aviso de novas reservas: consulta leve e periódica; não altera o estado global da UI.
  useEffect(() => {
    if (!canAccessInbox(authRole, authEnabled)) return;
    let alive = true;
    const tick = async () => {
      if (pathname.startsWith("/inbox")) {
        setNovas(0);
        return;
      }
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const seenAt = Number(localStorage.getItem(SEEN_KEY) || 0);
        if (alive && data?.snapshot?.roomsById) {
          setNovas(countNewReservas(data.snapshot.roomsById, seenAt));
        }
      } catch {
        /* ignora falhas transitórias */
      }
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [authRole, authEnabled, pathname]);

  return (
    <div className="sb-nav">
      <Link href="/" className={`sb-item ${pathname === "/" ? "active" : ""}`}>
        Dashboard
      </Link>
      <Link href="/rooms" className={`sb-item ${pathname.startsWith("/rooms") ? "active" : ""}`}>
        Salas
      </Link>
      {canAccessTvPanel(authLogin) ? (
        <Link href="/panel" className={`sb-item ${pathname.startsWith("/panel") ? "active" : ""}`}>
          Painel TV
        </Link>
      ) : null}
      {canAccessInbox(authRole, authEnabled) ? (
        <Link href="/inbox" className={`sb-item ${pathname.startsWith("/inbox") ? "active" : ""}`}>
          Reservas
          {novas > 0 ? (
            <span className="nav-badge" title={`${novas} reserva(s) nova(s)`}>
              {novas}
            </span>
          ) : null}
        </Link>
      ) : null}
      {canAccessReports(authRole, authEnabled) ? (
        <>
          <Link href="/reports" className={`sb-item ${pathname === "/reports" ? "active" : ""}`}>
            Relatórios
          </Link>
          <Link
            href="/reports/vendas"
            className={`sb-item ${pathname.startsWith("/reports/vendas") ? "active" : ""}`}
          >
            Vendas por período
          </Link>
        </>
      ) : null}
      {canAccessHistorico(authRole, authEnabled) ? (
        <Link href="/historico" className={`sb-item ${pathname.startsWith("/historico") ? "active" : ""}`}>
          Histórico
        </Link>
      ) : null}
      {!authEnabled || isAdminGestor(authRole, authLogin) ? (
        <Link href="/nichos" className={`sb-item ${pathname.startsWith("/nichos") ? "active" : ""}`}>
          Nichos
        </Link>
      ) : null}
    </div>
  );
}
