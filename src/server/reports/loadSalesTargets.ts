import fs from "fs";
import path from "path";

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

export function loadSalesTargets(): SalesTargetsFile {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = fs.readFileSync(FILE, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) return {};
    return j as SalesTargetsFile;
  } catch {
    return {};
  }
}
