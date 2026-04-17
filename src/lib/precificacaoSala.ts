/**
 * Precificação por faixa: o valor do imóvel deriva do **valor do m²** × base fixa (40 ou 140 m²),
 * alinhada à tipologia já usada nos relatórios (limiar 100 m²).
 */

export type AreaBasePrecificacaoM2 = 40 | 140;

/** Base de cálculo para precificação: ~40 m² ou ~140 m² (mesmo critério que tipologia 40 vs 140). */
export function areaBasePrecificacaoM2(area: number): AreaBasePrecificacaoM2 {
  if (!Number.isFinite(area) || area <= 0) return 40;
  return area < 100 ? 40 : 140;
}

export function computeValorImovelFromValorM2(valorM2: number, baseM2: AreaBasePrecificacaoM2): number {
  if (!Number.isFinite(valorM2) || valorM2 <= 0) return 0;
  return valorM2 * baseM2;
}

export function computeValorM2FromValorImovel(valorImovel: number, baseM2: AreaBasePrecificacaoM2): number {
  if (!Number.isFinite(valorImovel) || valorImovel <= 0 || !Number.isFinite(baseM2) || baseM2 <= 0) return 0;
  return valorImovel / baseM2;
}

/** Valor esperado para conferência (dados atuais da sala, sem persistir). */
export function valorImovelEsperadoDeMeta(area: number, valorM2: number | undefined | null): number | null {
  if (typeof valorM2 !== "number" || !Number.isFinite(valorM2) || valorM2 <= 0) return null;
  return computeValorImovelFromValorM2(valorM2, areaBasePrecificacaoM2(area));
}

/** Diferença relativa (0–1) entre armazenado e esperado; `null` se não for possível comparar. */
export function divergenciaValorImovelVsM2(
  area: number,
  valorM2: number | undefined | null,
  valorImovel: number | undefined | null,
): { rel: number; abs: number } | null {
  const esp = valorImovelEsperadoDeMeta(area, valorM2);
  if (esp == null || esp <= 0) return null;
  if (typeof valorImovel !== "number" || !Number.isFinite(valorImovel)) return null;
  const abs = Math.abs(valorImovel - esp);
  return { rel: abs / esp, abs };
}
