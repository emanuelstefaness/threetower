import fs from "fs";
import path from "path";
import type { BuildingSnapshot } from "@/lib/buildingTypes";

/**
 * Caminho do ficheiro JSON com o estado completo do prédio.
 * Em produção, aponta para um volume montado (Docker, VPS) ou caminho persistente.
 * `BUILDING_PERSISTENCE=0` desativa leitura/escrita (útil para testes).
 */
export function getBuildingStatePath(): string {
  const fromEnv = process.env.BUILDING_STATE_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), ".data", "building-state.json");
}

export function isPersistenceEnabled(): boolean {
  const v = process.env.BUILDING_PERSISTENCE?.toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

export function isBuildingSnapshot(x: unknown): x is BuildingSnapshot {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.floors === "object" &&
    o.floors !== null &&
    typeof o.roomsById === "object" &&
    o.roomsById !== null &&
    typeof o.floorAggregates === "object" &&
    o.floorAggregates !== null &&
    typeof o.summary === "object" &&
    o.summary !== null &&
    Array.isArray(o.notifications)
  );
}

export function loadPersistedSnapshot(): BuildingSnapshot | null {
  if (!isPersistenceEnabled()) return null;
  const file = getBuildingStatePath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isBuildingSnapshot(parsed)) {
      quarantineCorruptFile(file);
      return null;
    }
    return parsed;
  } catch {
    quarantineCorruptFile(file);
    return null;
  }
}

function quarantineCorruptFile(file: string): void {
  try {
    if (fs.existsSync(file)) {
      const bad = `${file}.corrupt.${Date.now()}`;
      fs.renameSync(file, bad);
    }
  } catch {
    // ignore
  }
}

/** Gravação atómica (escreve .tmp e renomeia) para reduzir corrupção em falha a meio. */
export function savePersistedSnapshot(state: BuildingSnapshot): void {
  if (!isPersistenceEnabled()) return;
  const file = getBuildingStatePath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const json = JSON.stringify(state);
  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, file);
}
