"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchBuildingState, saveNiches } from "@/features/building/apiClient";
import { useBuildingStoreClient } from "@/features/building/buildingStoreClient";
import { SidebarNav } from "@/features/dashboard/SidebarNav";
import { AuthLogoutButton } from "@/features/auth/AuthLogoutButton";
import { BrandLogo } from "@/features/ui/BrandLogo";
import { MinimalUiToggle } from "@/features/ui/MinimalUiToggle";
import { isAdminGestor } from "@/lib/authUi";
import type { NicheDef } from "@/lib/buildingTypes";

const DEFAULT_COLORS = ["#22d3a5", "#a78bfa", "#f59e0b", "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#ef4444"];

function makeId(nome: string): string {
  const slug = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "nicho"}-${Math.random().toString(16).slice(2, 6)}`;
}

export default function NichosClient() {
  const { building, authRole, authLogin, authEnabled, setBuilding, setRealtime } = useBuildingStoreClient();
  const [rows, setRows] = useState<NicheDef[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; icon: string } | null>(null);

  const showToast = (msg: string, icon = "✅") => {
    setToast({ msg, icon });
    window.setTimeout(() => setToast((t) => (t?.msg === msg ? null : t)), 3000);
  };

  useEffect(() => {
    let alive = true;
    fetchBuildingState()
      .then(({ snapshot, appMode, authEnabled: ae, authRole: r, authName, authLogin: al }) =>
        alive && setBuilding(snapshot, appMode, ae, r, authName, al),
      )
      .catch((e) => alive && setRealtime({ lastError: e instanceof Error ? e.message : "Erro ao carregar" }));
    return () => {
      alive = false;
    };
  }, [setBuilding, setRealtime]);

  // Popula a lista editável a partir do catálogo persistido (uma vez).
  useEffect(() => {
    if (seeded || !building) return;
    setRows((building.nichesConfig ?? []).map((n) => ({ ...n })));
    setSeeded(true);
  }, [building, seeded]);

  const isAdmin = !authEnabled || isAdminGestor(authRole, authLogin);

  /** Contagem de salas por nicho (para avisar ao remover um nicho em uso). */
  const usageById = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of Object.values(building?.roomsById ?? {})) {
      const id = (room.meta?.nicho ?? "").trim();
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [building]);

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      { id: makeId("nicho"), nome: "", cor: DEFAULT_COLORS[rs.length % DEFAULT_COLORS.length] },
    ]);

  const updateRow = (idx: number, patch: Partial<NicheDef>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));

  const save = async () => {
    // Valida nomes preenchidos e ids únicos.
    const clean = rows
      .map((r) => ({ id: r.id.trim() || makeId(r.nome), nome: r.nome.trim(), cor: r.cor.trim() || "#64748b" }))
      .filter((r) => r.nome);
    const ids = new Set<string>();
    for (const r of clean) {
      if (ids.has(r.id)) r.id = makeId(r.nome);
      ids.add(r.id);
    }
    setSaving(true);
    try {
      const saved = await saveNiches(clean);
      setRows(saved.map((n) => ({ ...n })));
      // Atualiza o estado global para refletir na planta/dashboard sem recarregar.
      const { snapshot, appMode, authEnabled: ae, authRole: r, authName, authLogin: al } = await fetchBuildingState();
      setBuilding(snapshot, appMode, ae, r, authName, al);
      showToast("Nichos salvos");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Falha ao salvar", "⚠️");
    } finally {
      setSaving(false);
    }
  };

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
          <div className="sb-section">Nichos</div>
          <div className="sb-manage">
            <div className="sb-count">
              {rows.length} nicho{rows.length !== 1 ? "s" : ""}
            </div>
          </div>
        </aside>

        <main className="main">
          <div>
            <div className="main-title">Nichos de mercado</div>
            <div className="main-sub">
              Configure os nichos (ex.: Dentista, Consultório). Depois, ao vender uma sala, escolha o nicho dela.
              Os nichos aparecem abaixo da planta de cada andar e no gráfico do dashboard.
            </div>
          </div>

          {!isAdmin ? (
            <div className="manager-wrap" style={{ marginTop: 16 }}>
              <div className="em-readonly-banner" style={{ borderRadius: 12 }}>
                Apenas a administradora pode configurar os nichos.
              </div>
            </div>
          ) : (
            <div className="manager-wrap" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.length === 0 ? (
                  <div className="em-readonly-banner" style={{ borderRadius: 12 }}>
                    Nenhum nicho ainda. Clique em “Adicionar nicho”.
                  </div>
                ) : (
                  rows.map((r, idx) => {
                    const used = usageById.get(r.id) ?? 0;
                    return (
                      <div
                        key={`${r.id}-${idx}`}
                        className="em-section"
                        style={{ margin: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                      >
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(r.cor) ? r.cor : "#64748b"}
                          onChange={(e) => updateRow(idx, { cor: e.target.value })}
                          style={{ width: 40, height: 34, border: "none", background: "none", cursor: "pointer" }}
                          title="Cor do nicho"
                        />
                        <input
                          className="em-input"
                          style={{ flex: 1, minWidth: 160 }}
                          placeholder="Nome do nicho (ex.: Dentista)"
                          value={r.nome}
                          onChange={(e) => updateRow(idx, { nome: e.target.value })}
                        />
                        <span style={{ fontSize: 11, opacity: 0.7, minWidth: 92 }}>
                          {used} sala{used !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          className="em-btn em-cancel"
                          onClick={() => removeRow(idx)}
                          title={used > 0 ? `${used} sala(s) usam este nicho — ficarão sem nicho` : "Remover nicho"}
                        >
                          Remover
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button type="button" className="em-btn em-cancel" onClick={addRow} disabled={saving}>
                  + Adicionar nicho
                </button>
                <button type="button" className="em-btn em-save" onClick={save} disabled={saving}>
                  {saving ? "Salvando…" : "Salvar nichos"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div className="toast show" role="status" aria-live="polite">
          <span className="toast-ico">{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <MinimalUiToggle />
    </>
  );
}
