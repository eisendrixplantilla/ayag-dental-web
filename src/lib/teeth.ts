/*
 * Teeth in FDI numbering, laid out the way a dentist reads a chart: facing the patient,
 * so the patient's right side is on the left. Upper arch on top, lower underneath.
 */
export const ADULT = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
};
export const CHILD = {
  upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
};
const ORDER = [...ADULT.upper, ...ADULT.lower, ...CHILD.upper, ...CHILD.lower];
const VALID = new Set(ORDER);
export const isChild = (t: number) => t >= 51;

/** The chart's teeth in a saved Tooth No. ("16, 26", "36", "11 & 21"); anything else is left out. */
export function parseTeeth(text: string | null | undefined): number[] {
  const found = (text ?? "").match(/\d{2}/g)?.map(Number).filter((n) => VALID.has(n)) ?? [];
  return [...new Set(found)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

/** How the chosen teeth are saved in Tooth No.: "16, 26". */
export const formatTeeth = (teeth: number[]) =>
  [...teeth].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join(", ");
