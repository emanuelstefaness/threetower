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

let writeChain: Promise<void> = Promise.resolve();

export function queuePostgresSave(state: BuildingSnapshot): void {
  writeChain = writeChain
    .then(async () => {
      const pool = getPool();
      await ensureTable(pool);
      await pool.query(
        `INSERT INTO building_state (id, snapshot) VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
        [JSON.stringify(state)]
      );
    })
    .catch(() => {
      // Falha silenciosa como no disco; não expor conteúdo do estado em logs.
    });
}

/** Gravação imediata (ex.: import Excel) — evita perder dados em serverless antes da fila correr. */
export async function savePostgresSnapshotNow(state: BuildingSnapshot): Promise<void> {
  const pool = getPool();
  await ensureTable(pool);
  await pool.query(
    `INSERT INTO building_state (id, snapshot) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
    [JSON.stringify(state)]
  );
}
