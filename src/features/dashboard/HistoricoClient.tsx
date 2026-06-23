"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchBuildingState } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { SidebarNav } from "@/features/dashboard/SidebarNav";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { MinimalUiToggle } from "@/features/ui/MinimalUiToggle";
import { formatDecimalBRL, formatMoneyBRL } from "@/lib/formatMoney";

type Entry = {
  at: number;
  by: string;
  roomId: number;
  roomName: string;
  floor: number;
  kind: "status" | "valores";
  text: string;
};

export default function HistoricoClient() {
  const { building, setBuilding, setRealtime } = useBuildingStoreClient();
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode, authEnabled, authRole, authName, authLogin }) =>
        alive && setBuilding(snapshot, appMode, authEnabled, authRole, authName, authLogin),
      )
      .catch((e) => alive && setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" }));
    return () => {
      alive = false;
    };
  }, [setBuilding, setRealtime]);

  const entries = useMemo(() => {
    if (!building) return [] as Entry[];
    const out: Entry[] = [];
    for (const room of Object.values(building.roomsById)) {
      const name = room.name ?? `Sala ${room.id}`;
      for (const h of room.statusSalaHistory ?? []) {
        out.push({
          at: h.at,
          by: h.by,
          roomId: room.id,
          roomName: name,
          floor: room.floor,
          kind: "status",
          text: `${h.from === "init" ? "—" : h.from} → ${h.to}${h.reason ? " · " + h.reason : ""}`,
        });
      }
      for (const fp of room.meta?.faixaPrecoHistorico ?? []) {
        out.push({
          at: fp.at,
          by: fp.by,
          roomId: room.id,
          roomName: name,
          floor: room.floor,
          kind: "valores",
          text: `valor m²: ${formatDecimalBRL(fp.valorM2)} · imóvel: ${formatMoneyBRL(fp.valorImovel)}${
            fp.faixa && fp.faixa !== "—" ? " · faixa " + fp.faixa : ""
          }`,
        });
      }
    }
    out.sort((a, b) => b.at - a.at);
    return out;
  }, [building]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? entries.filter(
          (e) =>
            e.by.toLowerCase().includes(q) ||
            e.roomName.toLowerCase().includes(q) ||
            String(e.roomId).includes(q) ||
            e.text.toLowerCase().includes(q),
        )
      : entries;
    return list.slice(0, 500);
  }, [entries, query]);

  const fmt = (ms: number) => new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <header className="topbar">
        <BrandLogo />
        <AuthLogoutButton />
        <div className="top-spacer" />
      </header>

      <div className="layout rooms-layout">
        <aside className="sidebar">
          <div className="sb-header">Painel</div>
          <SidebarNav />
          <div className="sb-divider" />
          <div className="sb-section">Histórico</div>
          <div className="sb-manage">
            <div className="sb-count">
              {entries.length} alteraç{entries.length !== 1 ? "ões" : "ão"}
            </div>
          </div>
        </aside>

        <main className="main">
          <div>
            <div className="main-title">Histórico de alterações</div>
            <div className="main-sub">
              Todas as mudanças nas salas (status, reservas, vendas, distratos, valores) — quem fez e quando.
            </div>
          </div>

          <div className="manager-wrap" style={{ marginTop: 16 }}>
            <input
              className="em-input"
              style={{ maxWidth: 380, marginBottom: 14 }}
              placeholder="Filtrar por sala, pessoa ou ação…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {filtered.length === 0 ? (
              <div className="em-readonly-banner" style={{ borderRadius: 12 }}>
                Nenhuma alteração registrada.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.map((e, i) => (
                  <div
                    key={`${e.roomId}-${e.at}-${i}`}
                    className="em-section"
                    style={{ margin: 0, display: "flex", gap: 12, alignItems: "flex-start" }}
                  >
                    <div
                      style={{ minWidth: 116, fontSize: 11, opacity: 0.7, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {fmt(e.at)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--white)" }}>
                        <strong>Sala {e.roomId}</strong>{" "}
                        <span style={{ opacity: 0.7 }}>
                          · {e.roomName} · Andar {e.floor}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, marginTop: 2 }}>{e.text}</div>
                      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                        por <strong>{e.by || "—"}</strong> · {e.kind}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <MinimalUiToggle />
    </>
  );
}
