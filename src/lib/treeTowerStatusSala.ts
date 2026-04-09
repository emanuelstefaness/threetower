/**
 * Valores exatos da coluna STATUS SALA da planilha “Salas Tree Tower”.
 * Podem ser alterados depois via UI; a lista garante opções corretas no select.
 */
export const TREE_TOWER_STATUS_SALA_OPTIONS: string[] = [
  "ATACADO",
  "AUDITÓRIO",
  "DBN | AQUISIÇÃO QUAVO",
  "DBN | BRENO",
  "DBN | CENTRAL",
  "DBN | TERRENO",
  "ESTOQUE",
  "RESERVADA",
  "VENDIDO",
  "ÁREA DE LOCAÇÃO ROOFTOP",
];

const STATUS_SALA_COLOR_BY_KEY: Record<string, string> = {
  "RESERVADA": "#c026d3",
  "VENDIDO": "#ef4444",
  "ESTOQUE": "#22d3a5",
  "DBN | AQUISIÇÃO QUAVO": "#a78bfa",
  "DBN | BRENO": "#8b5cf6",
  "DBN | CENTRAL": "#7c3aed",
  "DBN | TERRENO": "#c4b5fd",
  "AUDITÓRIO": "#f59e0b",
  "ATACADO": "#f97316",
  "ÁREA DE LOCAÇÃO ROOFTOP": "#06b6d4",
};

const FALLBACK_STATUS_SALA_COLORS = [
  "#22d3a5",
  "#ef4444",
  "#a78bfa",
  "#f59e0b",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#ec4899",
];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function normalizeStatusSala(statusSala: string | undefined): string {
  return (statusSala ?? "").trim().toUpperCase();
}

export function colorForStatusSala(statusSala: string | undefined): string {
  const normalized = normalizeStatusSala(statusSala);
  if (!normalized) return "#64748b";
  if (STATUS_SALA_COLOR_BY_KEY[normalized]) return STATUS_SALA_COLOR_BY_KEY[normalized];
  const idx = hashString(normalized) % FALLBACK_STATUS_SALA_COLORS.length;
  return FALLBACK_STATUS_SALA_COLORS[idx] ?? "#64748b";
}

/** Cor aproximada na planta 2D conforme o status da planilha. */
export function planToneForStatusSala(statusSala: string | undefined): "d" | "i" | "v" | "a" {
  const u = normalizeStatusSala(statusSala);
  if (u === "VENDIDO") return "i";
  if (u === "RESERVADA" || u.includes("RESERV")) return "v";
  if (u === "ESTOQUE") return "d";
  if (u.includes("DBN")) return "v";
  if (u.includes("AUDIT")) return "a";
  if (u.includes("ATACADO")) return "a";
  if (u.includes("ROOFTOP")) return "a";
  return "d";
}
