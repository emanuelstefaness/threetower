/**
 * SIMULAÇÃO (dry-run) da atualização da tabela de preços — NÃO grava em lado nenhum.
 *
 * Cruza o Excel da tabela de preços com um backup JSON do banco (scripts/backup-db.mjs)
 * e escreve um relatório CSV com cada diferença (valor antigo -> novo).
 *
 * Uso:
 *   node scripts/preco-import-dryrun.mjs "<arquivo.xlsx>" [backups/building-state-....json]
 *
 * Sem o 2º argumento usa o backup mais recente de backups/.
 * Saída: importacao/relatorio-precos-<data-hora>.csv (pasta no .gitignore; tem dados comerciais).
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Uso: node scripts/preco-import-dryrun.mjs "<arquivo.xlsx>" [backup.json]');
  process.exit(1);
}
let backupPath = process.argv[3];
if (!backupPath) {
  const f = readdirSync("backups").filter((x) => x.endsWith(".json")).sort().pop();
  if (!f) throw new Error("Nenhum backup em backups/. Rode scripts/backup-db.mjs primeiro.");
  backupPath = join("backups", f);
}

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005);

// ---- Excel ----
const wb = XLSX.readFile(xlsxPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
const excel = grid
  .slice(1)
  .filter((r) => r.some((c) => c !== null && c !== ""))
  .map((r, i) => ({
    linha: i + 2,
    numeroAndar: num(r[1]),
    unidade: String(r[2] ?? "").trim(),
    matricula: String(r[4] ?? "").trim(),
    base: num(r[5]),
    precificacao: String(r[6] ?? "").trim(),
    faixa: String(r[7] ?? "").trim(),
    valorM2: num(r[8]),
    valorImovel: num(r[9]),
  }));

// ---- Sistema (backup) ----
const backup = JSON.parse(readFileSync(backupPath, "utf8"));
const snap = backup.rows[0].snapshot;
const rooms = Object.values(snap.roomsById);
const byMat = new Map();
const byUnit = new Map();
for (const r of rooms) {
  const m = r.meta ?? {};
  if (m.matricula) byMat.set(String(m.matricula).trim(), r);
  byUnit.set(`${m.numeroAndar ?? r.floor}|${norm(m.unidade ?? r.name)}`, r);
}

const FIELDS = [
  ["valorImovel", "VALOR DO IMÓVEL"],
  ["valorM2", "VALOR M²"],
  ["faixa", "FAIXA"],
  ["precificacao", "PRECIFICAÇÃO"],
  ["base", "BASE DE CÁLCULO"],
];
const sysVal = (m, f) => (f === "base" ? num(m.baseCalculoVenda) : f === "faixa" || f === "precificacao" ? String(m[f] ?? "").trim() : num(m[f]));

const diffs = [];
const unmatched = [];
const matchedIds = new Set();
const stats = {}; // por statusSala: { total, mudam, iguais }
for (const e of excel) {
  const room = byMat.get(e.matricula) ?? byUnit.get(`${e.numeroAndar}|${norm(e.unidade)}`);
  if (!room) {
    unmatched.push(e);
    continue;
  }
  matchedIds.add(room.id);
  const st = (room.statusSala ?? "(vazio)").toUpperCase();
  const s = (stats[st] ??= { total: 0, mudam: 0, iguais: 0 });
  s.total++;
  const m = room.meta ?? {};
  let changed = false;
  for (const [f, label] of FIELDS) {
    const antes = sysVal(m, f);
    const depois = e[f];
    const eq = typeof depois === "string" ? String(antes ?? "") === depois : same(antes, depois);
    if (!eq) {
      changed = true;
      diffs.push({ sala: room.id, andar: m.numeroAndar ?? room.floor, unidade: m.unidade ?? room.name, status: st, campo: label, antes, depois, linhaExcel: e.linha });
    }
  }
  changed ? s.mudam++ : s.iguais++;
}
const notInExcel = rooms.filter((r) => !matchedIds.has(r.id));

// ---- Saída ----
mkdirSync("importacao", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = join("importacao", `relatorio-precos-${stamp}.csv`);
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = ["sala_id;andar;unidade;status;campo;antes;depois;linha_excel"]
  .concat(diffs.map((d) => [d.sala, d.andar, q(d.unidade), q(d.status), q(d.campo), d.antes ?? "", d.depois ?? "", d.linhaExcel].join(";")))
  .join("\n");
writeFileSync(out, "﻿" + csv, "utf8");

console.log(`Backup usado: ${backupPath}`);
console.log(`Excel: ${excel.length} linhas | Sistema: ${rooms.length} salas`);
console.log(`Casadas: ${matchedIds.size} | Excel sem sala no sistema: ${unmatched.length} | Salas do sistema fora do Excel: ${notInExcel.length}`);
console.log("\nPor STATUS SALA (salas casadas):");
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${k.padEnd(24)} total ${String(v.total).padStart(3)} | mudam ${String(v.mudam).padStart(3)} | iguais ${String(v.iguais).padStart(3)}`);
}
const porCampo = {};
diffs.forEach((d) => (porCampo[d.campo] = (porCampo[d.campo] ?? 0) + 1));
console.log("\nDiferenças por campo:", JSON.stringify(porCampo));
if (unmatched.length) console.log("\nExcel sem sala no sistema (até 15):", unmatched.slice(0, 15).map((e) => `${e.numeroAndar}/${e.unidade}/mat ${e.matricula}`).join(" ; "));
const fora = {};
notInExcel.forEach((r) => (fora[(r.statusSala ?? "(vazio)").toUpperCase()] = (fora[(r.statusSala ?? "(vazio)").toUpperCase()] ?? 0) + 1));
console.log("Salas fora do Excel por status:", JSON.stringify(fora));
console.log(`\nRelatório completo: ${out}`);
