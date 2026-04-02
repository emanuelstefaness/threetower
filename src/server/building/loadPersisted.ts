import type { BuildingSnapshot } from "@/lib/buildingTypes";
import {
  isPersistenceEnabled,
  loadPersistedSnapshot,
  savePersistedSnapshot,
} from "./persistBuildingState";
import { loadFromPostgres, queuePostgresSave } from "./persistPostgres";

function persistenceIsPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Carrega estado: PostgreSQL se `DATABASE_URL` estiver definido; senão ficheiro JSON. */
export async function loadPersistedSnapshotAsync(): Promise<BuildingSnapshot | null> {
  if (!isPersistenceEnabled()) return null;
  if (persistenceIsPostgres()) return loadFromPostgres();
  return loadPersistedSnapshot();
}

/** Grava estado: PostgreSQL (fila assíncrona) ou ficheiro (atómico). */
export function savePersistedSnapshotUniversal(state: BuildingSnapshot): void {
  if (!isPersistenceEnabled()) return;
  if (persistenceIsPostgres()) {
    queuePostgresSave(state);
    return;
  }
  try {
    savePersistedSnapshot(state);
  } catch {
    // igual ao store: não bloquear mutação
  }
}
