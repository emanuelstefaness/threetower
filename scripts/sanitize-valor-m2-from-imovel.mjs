import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";

const APPLY = process.argv.includes("--apply");

function areaBasePrecificacaoM2(area) {
  if (!Number.isFinite(area) || area <= 0) return 40;
  return area < 100 ? 40 : 140;
}

function isSnapshotLike(x) {
  return (
    x &&
    typeof x === "object" &&
    x.floors &&
    typeof x.floors === "object" &&
    x.roomsById &&
    typeof x.roomsById === "object" &&
    x.summary &&
    typeof x.summary === "object"
  );
}

function sanitizeSnapshot(snapshot) {
  const rooms = Object.values(snapshot.roomsById ?? {});
  let touched = 0;
  let unchanged = 0;

  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    if (!room.meta || typeof room.meta !== "object") room.meta = {};
    const imovel = room.meta.valorImovel;
    if (typeof imovel !== "number" || !Number.isFinite(imovel) || imovel <= 0) continue;

    const base = areaBasePrecificacaoM2(room.area);
    const nextM2 = imovel / base;
    const prevM2 = room.meta.valorM2;

    if (typeof prevM2 === "number" && Number.isFinite(prevM2) && prevM2 === nextM2 && room.meta.baseCalculoVenda === base) {
      unchanged += 1;
      continue;
    }

    room.meta.valorM2 = nextM2;
    room.meta.baseCalculoVenda = base;
    touched += 1;
  }

  return { touched, unchanged, totalRooms: rooms.length };
}

async function runPostgres() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;

  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS building_state (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        snapshot JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const res = await pool.query("SELECT snapshot FROM building_state WHERE id = 1");
    if (!res.rowCount) {
      console.log("Postgres: nenhum snapshot encontrado em building_state (id=1).");
      return true;
    }

    const raw = res.rows[0]?.snapshot;
    const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isSnapshotLike(snapshot)) throw new Error("Snapshot inválido em building_state.");

    const stats = sanitizeSnapshot(snapshot);
    console.log(
      `Postgres: ${stats.touched} salas ajustadas, ${stats.unchanged} já consistentes (total ${stats.totalRooms}).`,
    );

    if (APPLY && stats.touched > 0) {
      await pool.query(
        `INSERT INTO building_state (id, snapshot) VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
        [JSON.stringify(snapshot)],
      );
      console.log("Postgres: alterações aplicadas com sucesso.");
    } else if (!APPLY) {
      console.log("Postgres: dry-run (nada foi gravado). Use --apply para persistir.");
    } else {
      console.log("Postgres: nada para aplicar.");
    }
    return true;
  } finally {
    await pool.end();
  }
}

function getBuildingStatePath() {
  const fromEnv = process.env.BUILDING_STATE_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), ".data", "building-state.json");
}

function runFileFallback() {
  const file = getBuildingStatePath();
  if (!fs.existsSync(file)) {
    console.log(`Arquivo de snapshot não encontrado: ${file}`);
    return;
  }
  const raw = fs.readFileSync(file, "utf8");
  const snapshot = JSON.parse(raw);
  if (!isSnapshotLike(snapshot)) {
    throw new Error(`Snapshot inválido no arquivo: ${file}`);
  }
  const stats = sanitizeSnapshot(snapshot);
  console.log(`Arquivo: ${stats.touched} salas ajustadas, ${stats.unchanged} já consistentes (total ${stats.totalRooms}).`);

  if (APPLY && stats.touched > 0) {
    fs.writeFileSync(file, JSON.stringify(snapshot), "utf8");
    console.log(`Arquivo: alterações aplicadas em ${file}.`);
  } else if (!APPLY) {
    console.log("Arquivo: dry-run (nada foi gravado). Use --apply para persistir.");
  } else {
    console.log("Arquivo: nada para aplicar.");
  }
}

async function main() {
  try {
    const usedPostgres = await runPostgres();
    if (!usedPostgres) {
      console.log("DATABASE_URL ausente; usando fallback de arquivo local.");
      runFileFallback();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
