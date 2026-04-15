/**
 * Valores monetários em pt-BR: milhar com ponto, decimal com vírgula, símbolo R$.
 * Sempre 2 casas decimais (ex.: 1.000.000,00).
 */
const BRL_CURRENCY: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const nfBRL = new Intl.NumberFormat("pt-BR", BRL_CURRENCY);

export function tryFormatMoneyBRL(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return nfBRL.format(n);
}

export function formatMoneyBRL(value: unknown): string {
  return tryFormatMoneyBRL(value) ?? "—";
}

/** Número pt-BR sem símbolo (ex.: m², exportações). */
export function formatDecimalBRL(value: unknown, fractionDigits = 2): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

/** Rótulos compactos para eixos de gráficos (valores em R$), pt-BR. */
export function formatMoneyAxisBRL(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const fmt = (n: number, min: number, max: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max }).format(n);

  if (value >= 1_000_000_000) {
    const x = value / 1_000_000_000;
    return `${fmt(x, 0, x >= 100 ? 0 : 1)} bi`;
  }
  if (value >= 1_000_000) {
    const x = value / 1_000_000;
    return `${fmt(x, 0, x >= 100 ? 0 : 1)} mi`;
  }
  if (value >= 1_000) {
    const x = value / 1_000;
    return `${fmt(x, 0, x >= 100 ? 0 : 1)} mil`;
  }
  return fmt(value, 0, 0);
}

/**
 * Compacto pt-BR em milhares de reais (ex.: R$ 2.141 mil). Abaixo de mil reais, currency completo.
 * `withMilSuffix: false` omite " mil" (útil nos cards do dashboard de vendas).
 */
export function formatMoneyCompactMilBRL(value: unknown, options?: { withMilSuffix?: boolean }): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1000) return formatMoneyBRL(n);
  const mil = Math.round(n / 1000);
  const base = `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(mil)}`;
  if (options?.withMilSuffix === false) return base;
  return `${base} mil`;
}
