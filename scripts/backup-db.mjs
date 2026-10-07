/**
 * Backup do banco (Neon/Postgres) — guarda a tabela building_state num ficheiro JSON local.
 *
 * Uso (PowerShell):
 *   $env:DATABASE_URL = "<connection string da Neon>"
 *   node scripts/backup-db.mjs
 *
 * Só LÊ do banco (2 SELECTs). Grava em backups/building-state-<data-hora>.json.
 * A pasta backups/ está no .gitignore: o ficheiro tem dados de compradores e NÃO deve ir para o git.
 * Não imprime a connection string.
 */
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL não definido. Defina-o no terminal antes de correr (ver comentário no topo).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const { rows } = await pool.query("SELECT id, snapshot, updated_at FROM building_state ORDER BY id");
  if (rows.length === 0) {
    console.error("Tabela building_state está vazia — nada para guardar.");
    process.exit(2);
  }

  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join(dir, `building-state-${stamp}.json`);

  const payload = {
    backupAt: new Date().toISOString(),
    table: "building_state",
    rows: rows.map((r) => ({ id: r.id, updated_at: r.updated_at, snapshot: r.snapshot })),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  const snap = rows[0].snapshot ?? {};
  const rooms = Object.values(snap.roomsById ?? {});
  const sold = rooms.filter((r) => /VENDID|ATACADO/i.test(r?.statusSala ?? "")).length;
  console.log(`OK: ${file}`);
  console.log(`Tamanho: ${(statSync(file).size / 1024).toFixed(0)} KB | linhas: ${rows.length}`);
  console.log(`Última gravação no banco: ${new Date(rows[0].updated_at).toISOString()}`);
  console.log(`Salas: ${rooms.length} | vendidas/atacado: ${sold} | nichos no catálogo: ${(snap.nichesConfig ?? []).length}`);
} finally {
  await pool.end();
}
