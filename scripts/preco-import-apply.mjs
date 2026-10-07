/**
 * Atualização da tabela de preços (valor do imóvel + valor m²) a partir de um Excel.
 *
 * Três modos — só o último grava no banco real:
 *   1) Simulação (padrão)   node scripts/preco-import-apply.mjs "<xlsx>" [--backup backups/x.json]
 *        Lê o backup JSON, mostra o que mudaria. NÃO grava nada.
 *   2) Cópia local de teste node scripts/preco-import-apply.mjs "<xlsx>" --to-file .data/building-state.json
 *        Aplica sobre o snapshot do backup e grava num ficheiro local (para testar a app em dev).
 *   3) Banco real           $env:DATABASE_URL="..."; node scripts/preco-import-apply.mjs "<xlsx>" --apply
 *        Faz backup novo -> aplica -> grava com checagem de conflito (aborta se alguém alterou o
 *        banco entretanto). Só toca em meta.valorImovel, meta.valorM2 e no histórico de preço.
 *
 * Regras: salas VENDIDO (estrito) NUNCA são alteradas; ATACADO e as demais entram. Faixa, base,
 * precificação, comprador, descontos, datas e status ficam intocados. Cada alteração entra no
 * histórico de preço da sala com o valor anterior (aparece só para gestores).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const xlsxPath = args.find((a) => !a.startsWith("--") && a.toLowerCase().endsWith(".xlsx"));
if (!xlsxPath) {
  console.error('Uso: node scripts/preco-import-apply.mjs "<arquivo.xlsx>" [--backup f.json] [--to-file out.json] [--apply] [--by "Nome"]');
  process.exit(1);
}
const APPLY = flag("--apply");
const TO_FILE = opt("--to-file");
const BY = opt("--by") ?? "Atualização de tabela";

const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const areaBase = (area) => (!Number.isFinite(area) || area <= 0 ? 40 : area < 100 ? 40 : 140);
const isStrictSold = (st) => /^VENDID[OA]$/.test(norm(st));

// ---- Excel ----
const wb = XLSX.readFile(xlsxPath);
const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
const excel = grid
  .slice(1)
  .filter((r) => r.some((c) => c !== null && c !== ""))
  .map((r, i) => ({
    linha: i + 2,
    numeroAndar: num(r[1]),
    unidade: String(r[2] ?? "").trim(),
    matricula: String(r[4] ?? "").trim(),
    base: num(r[5]),
    valorM2: num(r[8]),
    valorImovel: num(r[9]),
  }));

// ---- Fonte do snapshot ----
let snapshot;
let dbUpdatedAt = null;
let pool = null;
let backupFileUsed = null;
if (APPLY) {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("--apply exige DATABASE_URL definido no terminal.");
  const pg = (await import("pg")).default;
  pool = new pg.Pool({ connectionString: url, max: 1 });
  const { rows } = await pool.query("SELECT snapshot, updated_at FROM building_state WHERE id = 1");
  if (!rows[0]) throw new Error("building_state sem linha id=1.");
  snapshot = rows[0].snapshot;
  dbUpdatedAt = rows[0].updated_at;
  // Backup novo ANTES de qualquer escrita.
  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  backupFileUsed = join("backups", `pre-atualizacao-precos-${stamp}.json`);
  writeFileSync(
    backupFileUsed,
    JSON.stringify({ backupAt: new Date().toISOString(), table: "building_state", rows: [{ id: 1, updated_at: dbUpdatedAt, snapshot }] }, null, 2),
    "utf8",
  );
  console.log(`Backup pré-atualização: ${backupFileUsed}`);
} else {
  backupFileUsed = opt("--backup");
  if (!backupFileUsed) {
    const f = readdirSync("backups").filter((x) => x.startsWith("building-state-") && x.endsWith(".json")).sort().pop();
    if (!f) throw new Error("Sem backup em backups/. Rode scripts/backup-db.mjs primeiro.");
    backupFileUsed = join("backups", f);
  }
  snapshot = JSON.parse(readFileSync(backupFileUsed, "utf8")).rows[0].snapshot;
}

// ---- Cruzamento ----
const rooms = Object.values(snapshot.roomsById);
const byMat = new Map();
const byUnit = new Map();
for (const r of rooms) {
  const m = r.meta ?? {};
  if (m.matricula) byMat.set(String(m.matricula).trim(), r);
  byUnit.set(`${m.numeroAndar ?? r.floor}|${norm(m.unidade ?? r.name)}`, r);
}

const now = Date.now();
const plan = [];
const skippedSold = [];
const unmatched = [];
const noChange = [];
let maxDevM2Excel = 0;
for (const e of excel) {
  const room = byMat.get(e.matricula) ?? byUnit.get(`${e.numeroAndar}|${norm(e.unidade)}`);
  if (!room) {
    unmatched.push(e);
    continue;
  }
  if (isStrictSold(room.statusSala)) {
    skippedSold.push(room);
    continue;
  }
  if (e.valorImovel == null || e.valorImovel <= 0) {
    unmatched.push({ ...e, motivo: "valor do imóvel inválido no Excel" });
    continue;
  }
  const m = room.meta ?? {};
  // Base de cálculo: a do sistema (igual à do Excel, conferido). O m² é DERIVADO do valor do imóvel.
  const base = typeof m.baseCalculoVenda === "number" && m.baseCalculoVenda > 0 ? m.baseCalculoVenda : e.base;
  if (!base || base <= 0 || (e.base && Math.abs(e.base - base) > 0.001)) {
    unmatched.push({ ...e, motivo: "base de cálculo ausente ou diferente entre Excel e sistema" });
    continue;
  }
  const novoImovel = r2(e.valorImovel);
  const novoM2 = r3(novoImovel / base);
  if (e.valorM2 != null) maxDevM2Excel = Math.max(maxDevM2Excel, Math.abs(novoM2 - e.valorM2));
  if (Math.abs((m.valorImovel ?? 0) - novoImovel) < 0.005 && Math.abs((m.valorM2 ?? 0) - novoM2) < 0.0005) {
    noChange.push(room);
    continue;
  }
  plan.push({ room, antesImovel: m.valorImovel, antesM2: m.valorM2, novoImovel, novoM2 });
}

console.log(`Excel: ${excel.length} linhas | Sistema: ${rooms.length} salas | Fonte: ${APPLY ? "BANCO (agora)" : backupFileUsed}`);
console.log(`A atualizar: ${plan.length} | VENDIDO preservadas (puladas): ${skippedSold.length} | já iguais: ${noChange.length} | Excel sem sala: ${unmatched.length}`);
const porStatus = {};
plan.forEach((p) => (porStatus[(p.room.statusSala ?? "(vazio)").toUpperCase()] = (porStatus[(p.room.statusSala ?? "(vazio)").toUpperCase()] ?? 0) + 1));
console.log("Por status:", JSON.stringify(porStatus));
const pcts = plan.filter((p) => p.antesImovel > 0).map((p) => (p.novoImovel / p.antesImovel - 1) * 100);
console.log(`m² = valor do imóvel ÷ base; maior diferença para o m² da coluna do Excel: ${maxDevM2Excel.toExponential(2)}`);
if (pcts.length) console.log(`Variação do valor do imóvel: min ${Math.min(...pcts).toFixed(2)}% | max ${Math.max(...pcts).toFixed(2)}%`);
const vendidoNoExcel = excel.filter((e) => {
  const r = byMat.get(e.matricula) ?? byUnit.get(`${e.numeroAndar}|${norm(e.unidade)}`);
  return r && isStrictSold(r.statusSala);
});
if (vendidoNoExcel.length) console.log("Preservadas por serem VENDIDO:", vendidoNoExcel.map((e) => e.unidade).join(", "));

if (!APPLY && !TO_FILE) {
  console.log("\nSIMULAÇÃO: nada foi gravado.");
  process.exit(0);
}

// ---- Aplicar em memória ----
for (const p of plan) {
  const room = p.room;
  const m = (room.meta ??= {});
  const hist = {
    at: now,
    by: BY,
    faixa: String(m.faixa ?? "").trim() || "—",
    valorM2: p.novoM2,
    valorImovel: p.novoImovel,
    areaBaseM2: areaBase(room.area),
    ...(typeof p.antesM2 === "number" ? { valorM2Anterior: p.antesM2 } : {}),
    ...(typeof p.antesImovel === "number" ? { valorImovelAnterior: p.antesImovel } : {}),
    ...(m.faixa ? { faixaAnterior: String(m.faixa).trim() } : {}),
  };
  m.valorImovel = p.novoImovel;
  m.valorM2 = p.novoM2;
  m.faixaPrecoHistorico = [hist, ...(m.faixaPrecoHistorico ?? [])].slice(0, 80);
}

if (TO_FILE) {
  writeFileSync(TO_FILE, JSON.stringify(snapshot), "utf8");
  console.log(`\nCópia local gravada em ${TO_FILE} (${plan.length} salas atualizadas). O banco real NÃO foi tocado.`);
  process.exit(0);
}

// ---- Gravar no banco real, com checagem de conflito ----
const res = await pool.query(
  "UPDATE building_state SET snapshot = $1::jsonb, updated_at = now() WHERE id = 1 AND updated_at = $2",
  [JSON.stringify(snapshot), dbUpdatedAt],
);
await pool.end();
if (res.rowCount !== 1) {
  console.error("\nABORTADO: o banco foi alterado por outra pessoa durante a execução. NADA foi gravado. Rode de novo.");
  process.exit(3);
}
console.log(`\nGRAVADO no banco: ${plan.length} salas atualizadas. Backup anterior: ${backupFileUsed}`);
