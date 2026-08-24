/**
 * Rumus indikator produktivitas ayam petelur — LAPISAN DOMAIN MURNI.
 * Tidak mengimpor Prisma/HTTP. Semua fungsi deterministik & dapat diuji sebagai
 * fungsi murni. Nilai dikembalikan dengan presisi penuh; `null` berarti
 * "belum dapat dihitung" (penyebut nol / data belum tersedia) — BUKAN error.
 *
 * Basis populasi hidup untuk indikator "per ekor" dapat dikonfigurasi.
 * Default sistem = OPENING (keputusan operasional BrahmaFarm).
 */

export type PopulationBasis = "OPENING" | "AVERAGE" | "CLOSING";

export const DEFAULT_POPULATION_BASIS: PopulationBasis = "OPENING";

/** Populasi hidup sesuai basis. */
export function livePopulation(
  opening: number,
  closing: number,
  basis: PopulationBasis = DEFAULT_POPULATION_BASIS
): number {
  switch (basis) {
    case "OPENING":
      return opening;
    case "CLOSING":
      return closing;
    case "AVERAGE":
      return (opening + closing) / 2;
  }
}

/** Pembagian aman: null jika penyebut <= 0. */
function safeDiv(numerator: number, denominator: number): number | null {
  if (!(denominator > 0)) return null;
  return numerator / denominator;
}

// ---------- Indikator harian ----------

/** HDP (%) = total telur / populasi hidup × 100 */
export function hdp(totalEggs: number, livePop: number): number | null {
  const r = safeDiv(totalEggs, livePop);
  return r === null ? null : r * 100;
}

/** HHP (%) = total telur / populasi awal flock × 100 */
export function hhp(totalEggs: number, initialPopulation: number): number | null {
  const r = safeDiv(totalEggs, initialPopulation);
  return r === null ? null : r * 100;
}

/** Egg mass per ekor per hari (g) = berat total telur (kg) × 1000 / populasi hidup */
export function eggMassPerHen(totalWeightKg: number, livePop: number): number | null {
  return safeDiv(totalWeightKg * 1000, livePop);
}

/** Konsumsi pakan per ekor per hari (g) = pakan dikonsumsi (kg) × 1000 / populasi hidup */
export function feedIntakePerHen(feedConsumedKg: number, livePop: number): number | null {
  return safeDiv(feedConsumedKg * 1000, livePop);
}

/**
 * FCR (egg mass) = pakan dikonsumsi (kg) / massa telur (kg).
 * WAJIB null bila massa telur = 0 — tidak boleh dibagi.
 */
export function fcr(feedConsumedKg: number, totalEggWeightKg: number): number | null {
  return safeDiv(feedConsumedKg, totalEggWeightKg);
}

/** Berat telur rata-rata (g/butir) = berat total (kg) × 1000 / total telur */
export function avgEggWeight(totalWeightKg: number, totalEggs: number): number | null {
  return safeDiv(totalWeightKg * 1000, totalEggs);
}

/** Mortalitas harian (%) = mati / populasi awal hari × 100 */
export function dailyMortality(mortality: number, openingPopulation: number): number | null {
  const r = safeDiv(mortality, openingPopulation);
  return r === null ? null : r * 100;
}

/** Persentase kategori telur terhadap total telur. */
export function eggCategoryPct(categoryCount: number, totalEggs: number): number | null {
  const r = safeDiv(categoryCount, totalEggs);
  return r === null ? null : r * 100;
}

// ---------- Indikator kumulatif (per flock) ----------

/** Mortalitas kumulatif (%) = Σ mati / populasi awal flock × 100 */
export function cumulativeMortality(totalMortality: number, initialPopulation: number): number | null {
  const r = safeDiv(totalMortality, initialPopulation);
  return r === null ? null : r * 100;
}

/** Deplesi (%) = Σ(mati + afkir) / populasi awal flock × 100 */
export function depletion(totalMortality: number, totalCulling: number, initialPopulation: number): number | null {
  const r = safeDiv(totalMortality + totalCulling, initialPopulation);
  return r === null ? null : r * 100;
}

/** Hen-housed eggs (butir/ekor) = Σ total telur / populasi awal flock */
export function henHousedEggs(totalEggs: number, initialPopulation: number): number | null {
  return safeDiv(totalEggs, initialPopulation);
}

/** Egg mass kumulatif (g/ekor housed) = Σ berat (kg) × 1000 / populasi awal flock */
export function cumulativeEggMass(totalWeightKg: number, initialPopulation: number): number | null {
  return safeDiv(totalWeightKg * 1000, initialPopulation);
}

// ---------- Perhitungan indikator harian terpadu ----------

export interface DailyIndicatorInput {
  openingPopulation: number;
  closingPopulation: number;
  initialPopulation: number; // populasi awal flock (untuk HHP)
  mortality: number;
  totalEggs: number;
  crackedEggs: number;
  dirtyEggs: number;
  totalWeightKg: number;
  feedConsumedKg: number;
  pricePerKg?: number | null;
  basis?: PopulationBasis;
}

export interface DailyIndicators {
  livePopulation: number;
  hdpPct: number | null;
  hhpPct: number | null;
  eggMassG: number | null;
  feedIntakeG: number | null;
  fcr: number | null;
  avgEggWeightG: number | null;
  mortalityPct: number | null;
  crackedPct: number | null;
  dirtyPct: number | null;
  feedCost: number | null;
}

/** Hitung seluruh indikator harian dari data mentah. Presisi penuh. */
export function computeDailyIndicators(input: DailyIndicatorInput): DailyIndicators {
  const basis = input.basis ?? DEFAULT_POPULATION_BASIS;
  const live = livePopulation(input.openingPopulation, input.closingPopulation, basis);
  return {
    livePopulation: live,
    hdpPct: hdp(input.totalEggs, live),
    hhpPct: hhp(input.totalEggs, input.initialPopulation),
    eggMassG: eggMassPerHen(input.totalWeightKg, live),
    feedIntakeG: feedIntakePerHen(input.feedConsumedKg, live),
    fcr: fcr(input.feedConsumedKg, input.totalWeightKg),
    avgEggWeightG: avgEggWeight(input.totalWeightKg, input.totalEggs),
    mortalityPct: dailyMortality(input.mortality, input.openingPopulation),
    crackedPct: eggCategoryPct(input.crackedEggs, input.totalEggs),
    dirtyPct: eggCategoryPct(input.dirtyEggs, input.totalEggs),
    feedCost:
      input.pricePerKg != null ? input.feedConsumedKg * input.pricePerKg : null,
  };
}

// ---------- Agregasi periode (mingguan/bulanan/siklus) ----------

export interface DailyAggregateRow {
  livePopulation: number;
  openingPopulation: number;
  mortality: number;
  culling: number;
  totalEggs: number;
  crackedEggs: number;
  dirtyEggs: number;
  totalWeightKg: number;
  feedConsumedKg: number;
  feedCost?: number | null;
}

export interface PeriodIndicators {
  days: number;
  avgPopulation: number | null;
  totalEggs: number;
  totalWeightKg: number;
  feedConsumedKg: number;
  hdpPct: number | null;
  eggMassG: number | null;
  feedIntakeG: number | null;
  fcr: number | null;
  avgEggWeightG: number | null;
  mortalityPct: number | null;
  crackedPct: number | null;
  dirtyPct: number | null;
  feedCost: number | null;
}

/**
 * Agregasi periode. PENTING: persentase periode BUKAN rata-rata persentase harian,
 * melainkan berbasis total telur ÷ Σ hen-days (Σ populasi hidup harian).
 * Mortalitas periode memakai populasi awal periode (baris pertama).
 */
export function aggregatePeriod(rows: DailyAggregateRow[]): PeriodIndicators {
  const days = rows.length;
  const sumLive = rows.reduce((s, r) => s + r.livePopulation, 0);
  const totalEggs = rows.reduce((s, r) => s + r.totalEggs, 0);
  const crackedEggs = rows.reduce((s, r) => s + r.crackedEggs, 0);
  const dirtyEggs = rows.reduce((s, r) => s + r.dirtyEggs, 0);
  const totalWeightKg = rows.reduce((s, r) => s + r.totalWeightKg, 0);
  const feedConsumedKg = rows.reduce((s, r) => s + r.feedConsumedKg, 0);
  const totalMortality = rows.reduce((s, r) => s + r.mortality, 0);
  const openingPeriod = rows.length > 0 ? rows[0].openingPopulation : 0;
  const feedCost = rows.reduce<number | null>((s, r) => {
    if (r.feedCost == null) return s;
    return (s ?? 0) + r.feedCost;
  }, null);

  return {
    days,
    avgPopulation: days > 0 ? sumLive / days : null,
    totalEggs,
    totalWeightKg,
    feedConsumedKg,
    hdpPct: hdp(totalEggs, sumLive),
    eggMassG: eggMassPerHen(totalWeightKg, sumLive),
    feedIntakeG: feedIntakePerHen(feedConsumedKg, sumLive),
    fcr: fcr(feedConsumedKg, totalWeightKg),
    avgEggWeightG: avgEggWeight(totalWeightKg, totalEggs),
    mortalityPct: dailyMortality(totalMortality, openingPeriod),
    crackedPct: eggCategoryPct(crackedEggs, totalEggs),
    dirtyPct: eggCategoryPct(dirtyEggs, totalEggs),
    feedCost,
  };
}
