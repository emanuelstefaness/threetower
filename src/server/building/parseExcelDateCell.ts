import * as XLSX from "xlsx";

/**
 * Converte células de data típicas do Excel (serial SSF, Date, texto dd/mm/aaaa) em epoch ms.
 */
export function parseExcelCellToUtcMs(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = value;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime();
  }

  const asSerial = (() => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const t = value.trim().replace(",", ".");
      if (!/^\d+(\.\d+)?$/.test(t)) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  })();

  if (asSerial != null && asSerial > 0 && asSerial < 2_958_466) {
    const p = XLSX.SSF.parse_date_code(asSerial);
    if (p && Number.isFinite(p.y) && Number.isFinite(p.m) && Number.isFinite(p.d)) {
      const ms = new Date(p.y, p.m - 1, p.d, p.H || 0, p.M || 0, p.S || 0, p.u || 0).getTime();
      return Number.isNaN(ms) ? undefined : ms;
    }
  }

  const s = String(value).trim();
  if (!s) return undefined;

  const br = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    const hh = br[4] != null ? Number(br[4]) : 12;
    const mm = br[5] != null ? Number(br[5]) : 0;
    const ms = new Date(year, month - 1, day, hh, mm, 0, 0).getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const ms = new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }

  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return parsed;
  return undefined;
}
