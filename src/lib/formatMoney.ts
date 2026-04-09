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
