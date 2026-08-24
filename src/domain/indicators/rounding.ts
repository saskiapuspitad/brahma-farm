/**
 * Kebijakan pembulatan.
 * PRINSIP: perhitungan memakai presisi penuh; pembulatan HANYA untuk tampilan.
 * Semua fungsi rumus mengembalikan nilai presisi penuh (number | null).
 * `roundDisplay` dipakai lapisan presentasi, bukan di dalam rantai perhitungan.
 */

/** Pembulatan half-up ke n desimal (default 2). Mengembalikan null bila input null/NaN. */
export function roundDisplay(value: number | null | undefined, decimals = 2): number | null {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  // + Number.EPSILON menstabilkan kasus seperti 1.005
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Toleransi perbandingan float untuk pengujian rumus. */
export const EPSILON = 1e-9;

export function approxEqual(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}
