/**
 * RIF venezolano: letra (V, E, J, P, G, C), 8 dígitos y dígito verificador.
 * Solo se valida el FORMATO. El algoritmo del dígito verificador y la
 * existencia real del RIF ante el SENIAT no se verifican (ver
 * docs/open-questions.md).
 */
const RIF_RE = /^([VEJPGC])-?(\d{8})-?(\d)$/;

export function normalizeRif(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/\s+/g, "");
  const m = RIF_RE.exec(compact);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function isValidRifFormat(input: string): boolean {
  return normalizeRif(input) !== null;
}
