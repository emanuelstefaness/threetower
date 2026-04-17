import fs from "fs";
import path from "path";
import { Pool } from "pg";

/** Metas por mês (`yyyy-mm`). Valores opcionais por métrica. */
export type SalesTargetsFile = Record<
  string,
  {
    faturamento?: number;
    quantidade?: number;
    n40?: number;
    n140?: number;
  }
>;

const FILE = path.join(process.cwd(), "data", "sales-targets.json");

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

let __targetsPool: Pool | undefined;

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!__targetsPool) __targetsPool = new Pool({ connectionString: url, max: 2 });
  return __targetsPool;
}

async function ensureTargetsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_sales_targets (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      targets JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function readOptionalMetric(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return undefined;
  return v;
}

/** Valida e normaliza o mapa de metas (chaves `YYYY-MM`, métricas não negativas). */
export function sanitizeSalesTargetsInput(raw: unknown): SalesTargetsFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: SalesTargetsFile = {};
  for (const [k, v] of Object.entries(src)) {
    if (!MONTH_KEY_RE.test(k)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const entry: SalesTargetsFile[string] = {};
    const fat = readOptionalMetric(o.faturamento);
    const qtd = readOptionalMetric(o.quantidade);
    const n40 = readOptionalMetric(o.n40);
    const n140 = readOptionalMetric(o.n140);
    if (fat !== undefined) entry.faturamento = fat;
    if (qtd !== undefined) entry.quantidade = Math.floor(qtd);
    if (n40 !== undefined) entry.n40 = Math.floor(n40);
    if (n140 !== undefined) entry.n140 = Math.floor(n140);
    if (Object.keys(entry).length > 0) out[k] = entry;
  }
  return out;
}

/** Leitura síncrona do ficheiro local (sem Postgres). */
export function loadSalesTargets(): SalesTargetsFile {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = fs.readFileSync(FILE, "utf8");
    const j = JSON.parse(raw) as unknown;
    return sanitizeSalesTargetsInput(j);
  } catch {
    return {};
  }
}

/**
 * Metas para a API: com `DATABASE_URL`, usa a tabela `report_sales_targets`;
 * caso contrário, `data/sales-targets.json`.
 */
export async function loadSalesTargetsAsync(): Promise<SalesTargetsFile> {
  const pool = getPool();
  if (pool) {
    await ensureTargetsTable(pool);
    const res = await pool.query<{ targets: unknown }>("SELECT targets FROM report_sales_targets WHERE id = 1");
    if (res.rowCount && res.rows[0]) {
      const raw = res.rows[0].targets;
      const j = typeof raw === "string" ? JSON.parse(raw) : raw;
      return sanitizeSalesTargetsInput(j);
    }
    return {};
  }
  return loadSalesTargets();
}

export async function saveSalesTargetsAsync(data: SalesTargetsFile): Promise<SalesTargetsFile> {
  const sanitized = sanitizeSalesTargetsInput(data);
  const pool = getPool();
  if (pool) {
    await ensureTargetsTable(pool);
    await pool.query(
      `INSERT INTO report_sales_targets (id, targets) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET targets = EXCLUDED.targets, updated_at = now()`,
      [JSON.stringify(sanitized)],
    );
    return sanitized;
  }
  const dir = path.dirname(FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sanitized, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
  return sanitized;
}
