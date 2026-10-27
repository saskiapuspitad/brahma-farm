/**
 * Seri data grafik per flock — LAPISAN DOMAIN MURNI (tanpa DB), dapat diuji.
 *
 * Mengubah recording harian mentah menjadi titik-titik grafik harian atau
 * mingguan (per umur minggu). Persentase periode dihitung dari total ÷ Σ hen-days
 * (lewat aggregatePeriod), BUKAN rata-rata persentase harian. Indikator kumulatif
 * (mortalitas, deplesi) dihitung sejak awal siklus walau rentang tanggal dibatasi.
 */
import {
  aggregatePeriod,
  cumulativeMortality,
  depletion,
  livePopulation,
  type DailyAggregateRow,
  type PopulationBasis,
} from "@/domain/indicators/formulas";

export type Grouping = "day" | "week";

export interface RawDay {
  date: string; // YYYY-MM-DD
  ageDays: number;
  ageWeek: number;
  opening: number;
  closing: number;
  mortality: number;
  culling: number;
  wholeEggs: number;
  crackedEggs: number;
  brokenEggs: number;
  dirtyEggs: number;
  abnormalEggs: number;
  totalEggs: number;
  eggWeightKg: number;
  feedKg: number;
  feedCost: number | null;
  waterL: number | null;
  tempAvg: number | null;
  humidityPct: number | null;
}

export interface StandardTarget {
  hdpPct: number | null;
  feedIntakeG: number | null;
  eggWeightG: number | null;
  eggMassG: number | null;
  fcr: number | null;
  maxCumMortalityPct: number | null;
}

export interface SeriesPoint {
  key: string;
  label: string;
  from: string;
  to: string;
  ageWeek: number;
  days: number;
  // Produksi telur
  totalEggs: number;
  wholeEggs: number;
  crackedEggs: number;
  brokenEggs: number;
  dirtyEggs: number;
  abnormalEggs: number;
  eggWeightKg: number;
  hdpPct: number | null;
  hhpPct: number | null;
  avgEggWeightG: number | null;
  eggMassG: number | null;
  crackedPct: number | null;
  dirtyPct: number | null;
  // Pakan
  feedKg: number;
  feedIntakeG: number | null;
  fcr: number | null;
  feedCost: number | null;
  feedCostPerKgEgg: number | null;
  // Populasi & kematian
  mortality: number;
  culling: number;
  mortalityPct: number | null;
  cumMortalityPct: number | null;
  depletionPct: number | null;
  closingPopulation: number;
  // Air & lingkungan
  waterL: number | null;
  waterPerHenMl: number | null;
  tempAvg: number | null;
  humidityPct: number | null;
  // Standar strain untuk umur ini
  target: StandardTarget | null;
}

export interface SeriesSummary {
  days: number;
  from: string | null;
  to: string | null;
  totalEggs: number;
  eggWeightKg: number;
  hdpPct: number | null;
  henHousedEggs: number | null; // butir per ekor awal, dalam rentang
  avgEggWeightG: number | null;
  eggMassG: number | null;
  feedKg: number;
  feedIntakeG: number | null;
  fcr: number | null;
  feedCost: number | null;
  mortality: number;
  culling: number;
  cumMortalityPct: number | null; // sejak awal siklus s.d. akhir rentang
  depletionPct: number | null;
  lastPopulation: number | null;
}

export interface BuildOptions {
  initialPopulation: number;
  basis: PopulationBasis;
  grouping: Grouping;
  from?: string;
  to?: string;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function avgOrNull(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? sum(v) / v.length : null;
}

function sumOrNull(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? sum(v) : null;
}

function toAggRow(d: RawDay, basis: PopulationBasis): DailyAggregateRow {
  return {
    livePopulation: livePopulation(d.opening, d.closing, basis),
    openingPopulation: d.opening,
    mortality: d.mortality,
    culling: d.culling,
    totalEggs: d.totalEggs,
    crackedEggs: d.crackedEggs,
    dirtyEggs: d.dirtyEggs,
    totalWeightKg: d.eggWeightKg,
    feedConsumedKg: d.feedKg,
    feedCost: d.feedCost,
  };
}

/** Label tanggal singkat "27/10". */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function buildFlockSeries(
  rawDays: RawDay[],
  opts: BuildOptions,
  targets: Map<number, StandardTarget> = new Map(),
): { points: SeriesPoint[]; summary: SeriesSummary } {
  const days = [...rawDays].sort((a, b) => a.date.localeCompare(b.date));
  const init = opts.initialPopulation;

  // Kumulatif sejak awal siklus (sebelum filter rentang).
  const cumMort = new Map<string, { mort: number; cull: number }>();
  let m = 0;
  let c = 0;
  for (const d of days) {
    m += d.mortality;
    c += d.culling;
    cumMort.set(d.date, { mort: m, cull: c });
  }

  const inRange = days.filter((d) => (!opts.from || d.date >= opts.from) && (!opts.to || d.date <= opts.to));

  // Kelompokkan.
  const groups = new Map<string, RawDay[]>();
  for (const d of inRange) {
    const key = opts.grouping === "week" ? `W${d.ageWeek}` : d.date;
    const g = groups.get(key);
    if (g) g.push(d);
    else groups.set(key, [d]);
  }

  const points: SeriesPoint[] = [];
  for (const [key, rows] of groups) {
    const agg = aggregatePeriod(rows.map((r) => toAggRow(r, opts.basis)));
    const first = rows[0];
    const last = rows[rows.length - 1];
    const cum = cumMort.get(last.date)!;
    const sumLive = sum(rows.map((r) => livePopulation(r.opening, r.closing, opts.basis)));
    const waterL = sumOrNull(rows.map((r) => r.waterL));
    // Umur minggu untuk pencocokan standar.
    const ageWeek = first.ageWeek;

    points.push({
      key,
      label: opts.grouping === "week" ? `Mg ${ageWeek}` : shortDate(first.date),
      from: first.date,
      to: last.date,
      ageWeek,
      days: rows.length,
      totalEggs: agg.totalEggs,
      wholeEggs: sum(rows.map((r) => r.wholeEggs)),
      crackedEggs: sum(rows.map((r) => r.crackedEggs)),
      brokenEggs: sum(rows.map((r) => r.brokenEggs)),
      dirtyEggs: sum(rows.map((r) => r.dirtyEggs)),
      abnormalEggs: sum(rows.map((r) => r.abnormalEggs)),
      eggWeightKg: agg.totalWeightKg,
      hdpPct: agg.hdpPct,
      hhpPct: init > 0 ? (agg.totalEggs / (init * rows.length)) * 100 : null,
      avgEggWeightG: agg.avgEggWeightG,
      eggMassG: agg.eggMassG,
      crackedPct: agg.crackedPct,
      dirtyPct: agg.dirtyPct,
      feedKg: agg.feedConsumedKg,
      feedIntakeG: agg.feedIntakeG,
      fcr: agg.fcr,
      feedCost: agg.feedCost,
      feedCostPerKgEgg: agg.feedCost != null && agg.totalWeightKg > 0 ? agg.feedCost / agg.totalWeightKg : null,
      mortality: sum(rows.map((r) => r.mortality)),
      culling: sum(rows.map((r) => r.culling)),
      mortalityPct: agg.mortalityPct,
      cumMortalityPct: cumulativeMortality(cum.mort, init),
      depletionPct: depletion(cum.mort, cum.cull, init),
      closingPopulation: last.closing,
      waterL,
      waterPerHenMl: waterL != null && sumLive > 0 ? (waterL * 1000) / sumLive : null,
      tempAvg: avgOrNull(rows.map((r) => r.tempAvg)),
      humidityPct: avgOrNull(rows.map((r) => r.humidityPct)),
      target: targets.get(ageWeek) ?? null,
    });
  }

  const all = aggregatePeriod(inRange.map((r) => toAggRow(r, opts.basis)));
  const lastDay = inRange[inRange.length - 1];
  const lastCum = lastDay ? cumMort.get(lastDay.date)! : null;
  const summary: SeriesSummary = {
    days: inRange.length,
    from: inRange[0]?.date ?? null,
    to: lastDay?.date ?? null,
    totalEggs: all.totalEggs,
    eggWeightKg: all.totalWeightKg,
    hdpPct: all.hdpPct,
    henHousedEggs: init > 0 ? all.totalEggs / init : null,
    avgEggWeightG: all.avgEggWeightG,
    eggMassG: all.eggMassG,
    feedKg: all.feedConsumedKg,
    feedIntakeG: all.feedIntakeG,
    fcr: all.fcr,
    feedCost: all.feedCost,
    mortality: sum(inRange.map((r) => r.mortality)),
    culling: sum(inRange.map((r) => r.culling)),
    cumMortalityPct: lastCum ? cumulativeMortality(lastCum.mort, init) : null,
    depletionPct: lastCum ? depletion(lastCum.mort, lastCum.cull, init) : null,
    lastPopulation: lastDay ? lastDay.closing : null,
  };

  return { points, summary };
}
