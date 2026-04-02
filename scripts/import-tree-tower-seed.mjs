import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import xlsx from "xlsx";

function normalizeHeader(h) {
  const s = String(h ?? "").trim();
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseRoomIdFromUnit(unitRaw) {
  const s = String(unitRaw ?? "").trim();
  const m = s.match(/(\d{3,4})/);
  if (!m) return undefined;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : undefined;
}

function slotFromRoomId(roomId) {
  const n = roomId % 100;
  if (!Number.isFinite(n) || n <= 0 || n > 99) return undefined;
  return `F-${String(n).padStart(2, "0")}`;
}

function mapStatus(statusSalaRaw) {
  const s = String(statusSalaRaw ?? "").trim().toUpperCase();
  // STATUS SALA na planilha é mais “categoria/uso” do que disponibilidade.
  // Aqui fazemos um mapeamento mínimo (não destrutivo) e preservamos o original em meta.
  if (s === "VENDIDO") return "ocupada";
  if (s === "ESTOQUE") return "disponivel";
  return "disponivel";
}

function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Uso: node scripts/import-tree-tower-seed.mjs "C:\\\\caminho\\\\Salas Tree Tower.xlsx"');
    process.exit(1);
  }

  const wb = xlsx.readFile(xlsxPath);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha sem abas");
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  if (rows.length < 3) throw new Error("Planilha vazia/inesperada");

  const headerRow = rows[1] ?? [];
  const headerMap = new Map();
  headerRow.forEach((h, idx) => {
    const key = normalizeHeader(h);
    if (key) headerMap.set(key, idx);
  });

  const idx = (name) => headerMap.get(normalizeHeader(name));

  const out = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const unidade = row[idx("UNIDADE")] ?? "";
    const roomId = parseRoomIdFromUnit(unidade);
    if (!roomId) continue;

    const floorNum = toNumber(row[idx("NUMERO ANDAR")]) ?? Math.floor(roomId / 100);
    const areaPriv = toNumber(row[idx("AREA PRIVATIVA M2")]) ?? toNumber(row[idx("AREA PRIVATIVA M")]) ?? undefined;
    const statusSalaRaw = row[idx("STATUS SALA")] ?? "";
    const statusSala = String(statusSalaRaw).trim();

    out.push({
      id: roomId,
      floor: floorNum,
      status: mapStatus(statusSalaRaw),
      statusSala,
      name: `Sala ${roomId}`,
      area: areaPriv ?? 25,
      planSlot: slotFromRoomId(roomId),
      meta: {
        andar: String(row[idx("ANDAR")] ?? "").trim() || undefined,
        numeroAndar: floorNum,
        unidade: String(unidade).trim(),
        escrituras: String(row[idx("ESCRITURAS")] ?? "").trim() || undefined,
        posicao: String(row[idx("POSICAO")] ?? "").trim() || undefined,
        matricula: String(row[idx("MATRIC.")] ?? row[idx("MATRIC")] ?? "").trim() || undefined,
        controle: String(row[idx("CONTROLE")] ?? "").trim() || undefined,
        areaCobertaM2: toNumber(row[idx("AREA COBERTA M2")]),
        areaDescobertaM2: toNumber(row[idx("AREA DESCOBERTA M2")]),
        areaPrivativaM2: areaPriv,
        baseCalculoVenda: toNumber(row[idx("BASE DE CALCULO VENDA")]),
        precificacao: String(row[idx("PRECIFICACAO")] ?? "").trim() || undefined,
        faixa: String(row[idx("FAIXA")] ?? "").trim() || undefined,
        valorM2: toNumber(row[idx("VALOR M2")]),
        valorImovel: toNumber(row[idx("VALOR DO IMOVEL")]),
        statusSalaOriginal: statusSala || undefined,
      },
    });
  }

  // ordena de forma estável: andar, depois id
  out.sort((a, b) => (a.floor - b.floor) || (a.id - b.id));

  const dest = path.join(process.cwd(), "src", "server", "building", "treeTowerSeed.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2), "utf8");
  console.log(`OK: gerado ${dest} (${out.length} salas)`);
}

main();
