import { Pool } from "pg";
import type { BuildingSnapshot } from "@/lib/buildingTypes";
import { isBuildingSnapshot } from "./persistBuildingState";

function getPool(): Pool {
  const g = globalThis as unknown as { __buildingPgPool?: Pool };
  if (g.__buildingPgPool) return g.__buildingPgPool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL não definido");
  g.__buildingPgPool = new Pool({ connectionString: url, max: 5 });
  return g.__buildingPgPool;
}

async function ensureTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS building_state (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      snapshot JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function loadFromPostgres(): Promise<BuildingSnapshot | null> {
  const pool = getPool();
  await ensureTable(pool);
  const res = await pool.query<{ snapshot: unknown }>("SELECT snapshot FROM building_state WHERE id = 1");
  if (res.rowCount === 0) return null;
  const raw = res.rows[0]?.snapshot;
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!isBuildingSnapshot(parsed)) return null;
  return parsed;
}

/**
 * Cache do snapshot por instância serverless (reduz drasticamente a transferência com o Neon).
 * A leitura pesada (blob JSONB inteiro) só ocorre quando o `updated_at` da base muda; entre
 * mudanças, serve da memória. Um TTL curto evita até a checagem de `updated_at` em rajadas.
 */
type SnapshotCache = { snapshot: BuildingSnapshot; dbUpdatedAt: string; cachedAt: number };
let snapshotCache: SnapshotCache | null = null;
/** Janela em que servimos direto da memória sem sequer consultar o `updated_at`. */
const CACHE_TTL_MS = 4000;

/** Invalida o cache local (após gravar nesta instância). */
function invalidateSnapshotCache(): void {
  snapshotCache = null;
}

/**
 * Igual a `loadFromPostgres`, mas com cache: dentro do TTL devolve da memória; passado o TTL,
 * consulta apenas `updated_at` (poucos bytes) e só puxa o blob inteiro se algo mudou.
 * Use no caminho de leitura (`/api/state`); no caminho de mutação continue com `loadFromPostgres`.
 */
export async function loadFromPostgresCached(): Promise<BuildingSnapshot | null> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.cachedAt < CACHE_TTL_MS) {
    return snapshotCache.snapshot;
  }
  const pool = getPool();
  await ensureTable(pool);
  const meta = await pool.query<{ updated_at: string }>(
    "SELECT updated_at FROM building_state WHERE id = 1"
  );
  if (meta.rowCount === 0) {
    snapshotCache = null;
    return null;
  }
  const dbUpdatedAt = String(meta.rows[0]?.updated_at ?? "");
  if (snapshotCache && snapshotCache.dbUpdatedAt === dbUpdatedAt) {
    // Nada mudou na base: revalida o TTL sem baixar o blob.
    snapshotCache.cachedAt = now;
    return snapshotCache.snapshot;
  }
  // Mudou (ou primeiro carregamento nesta instância): puxa o snapshot completo.
  const res = await pool.query<{ snapshot: unknown }>("SELECT snapshot FROM building_state WHERE id = 1");
  const raw = res.rows[0]?.snapshot;
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!isBuildingSnapshot(parsed)) return null;
  snapshotCache = { snapshot: parsed, dbUpdatedAt, cachedAt: now };
  return parsed;
}

/** Fila serial por processo; cada item grava o JSON capturado no momento do persist (evita estado mutável). */
let persistChain: Promise<void> = Promise.resolve();

export function queuePostgresSave(state: BuildingSnapshot): void {
  const frozenJson = JSON.stringify(state);
  persistChain = persistChain
    .then(async () => {
      const pool = getPool();
      await ensureTable(pool);
      await pool.query(
        `INSERT INTO building_state (id, snapshot) VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
        [frozenJson]
      );
      // Gravou nesta instância: invalida o cache para reler o novo `updated_at`.
      invalidateSnapshotCache();
    })
    .catch(() => {
      // Falha silenciosa como no disco; não expor conteúdo do estado em logs.
    });
}

/** Espera a fila de gravação PostgreSQL (Vercel: garantir persistência antes de responder). */
export async function awaitPostgresPersistenceQueue(): Promise<void> {
  await persistChain;
}

/** Gravação imediata (ex.: import administrativo) — evita perder dados em serverless antes da fila correr. */
export async function savePostgresSnapshotNow(state: BuildingSnapshot): Promise<void> {
  const pool = getPool();
  await ensureTable(pool);
  await pool.query(
    `INSERT INTO building_state (id, snapshot) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
    [JSON.stringify(state)]
  );
  invalidateSnapshotCache();
}
