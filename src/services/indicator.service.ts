import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  computeDailyIndicators,
  aggregatePeriod,
  cumulativeMortality,
  depletion,
  henHousedEggs,
  cumulativeEggMass,
  fcr as fcrFn,
  type PopulationBasis,
  type DailyAggregateRow,
} from "@/domain/indicators/formulas";
import { computeAge } from "@/domain/indicators/age";
import { getPopulationBasis } from "./settings.service";

type Client = Prisma.TransactionClient | typeof prisma;

const D = (n: number | null) => (n === null ? null : new Prisma.Decimal(n));

/**
 * Hitung indikator harian sebuah recording lalu simpan ke productivity_summaries
 * (period_type=DAILY). Idempotent (upsert). Mengembalikan indikator terhitung.
 */
export async function computeAndStoreDaily(dailyRecordId: bigint, client: Client = prisma) {
  const rec = await client.dailyRecord.findUniqueOrThrow({
    where: { id: dailyRecordId },
    include: { population: true, eggs: true, feed: true, flock: true },
  });
  if (!rec.population || !rec.eggs) throw new Error("Data populasi/telur belum lengkap");

  const basis: PopulationBasis = await getPopulationBasis(rec.farmId);
  const pop = rec.population;
  const eggs = rec.eggs;
  const feed = rec.feed;
  const pricePerKg = feed?.pricePerKg ? feed.pricePerKg.toNumber() : null;

  const ind = computeDailyIndicators({
    openingPopulation: pop.openingPopulation,
    closingPopulation: pop.closingPopulation,
    initialPopulation: rec.flock.initialPopulation,
    mortality: pop.mortality,
    totalEggs: eggs.totalEggs,
    crackedEggs: eggs.crackedEggs,
    dirtyEggs: eggs.dirtyEggs,
    totalWeightKg: eggs.totalWeightKg.toNumber(),
    feedConsumedKg: feed?.feedConsumedKg ? feed.feedConsumedKg.toNumber() : 0,
    pricePerKg,
    basis,
  });

  const age = computeAge(rec.flock.hatchDate, rec.recordDate);
  const dateKey = rec.recordDate.toISOString().slice(0, 10);

  await client.productivitySummary.upsert({
    where: { flockId_periodType_periodKey: { flockId: rec.flockId, periodType: "DAILY", periodKey: dateKey } },
    create: {
      flockId: rec.flockId,
      houseId: rec.houseId,
      dailyRecordId: rec.id,
      periodType: "DAILY",
      periodKey: dateKey,
      periodStart: rec.recordDate,
      periodEnd: rec.recordDate,
      ageDays: age.days,
      ageWeek: age.weeks,
      avgPopulation: D(ind.livePopulation),
      totalEggs: eggs.totalEggs,
      totalEggWeightKg: eggs.totalWeightKg,
      hdpPct: D(ind.hdpPct),
      hhpPct: D(ind.hhpPct),
      eggMassG: D(ind.eggMassG),
      feedIntakeG: D(ind.feedIntakeG),
      fcr: D(ind.fcr),
      avgEggWeightG: D(ind.avgEggWeightG),
      mortalityPct: D(ind.mortalityPct),
      crackedPct: D(ind.crackedPct),
      dirtyPct: D(ind.dirtyPct),
      feedConsumedKg: feed?.feedConsumedKg ?? new Prisma.Decimal(0),
      feedCost: D(ind.feedCost),
      isStale: false,
    },
    update: {
      houseId: rec.houseId,
      ageDays: age.days,
      ageWeek: age.weeks,
      avgPopulation: D(ind.livePopulation),
      totalEggs: eggs.totalEggs,
      totalEggWeightKg: eggs.totalWeightKg,
      hdpPct: D(ind.hdpPct),
      hhpPct: D(ind.hhpPct),
      eggMassG: D(ind.eggMassG),
      feedIntakeG: D(ind.feedIntakeG),
      fcr: D(ind.fcr),
      avgEggWeightG: D(ind.avgEggWeightG),
      mortalityPct: D(ind.mortalityPct),
      crackedPct: D(ind.crackedPct),
      dirtyPct: D(ind.dirtyPct),
      feedConsumedKg: feed?.feedConsumedKg ?? new Prisma.Decimal(0),
      feedCost: D(ind.feedCost),
      isStale: false,
      computedAt: new Date(),
    },
  });

  return { ...ind, ageDays: age.days, ageWeek: age.weeks, ageLabel: age.label };
}

/**
 * Recompute ringkasan siklus (CYCLE) untuk sebuah flock dari seluruh recording aktif.
 * Dipanggil setelah create/koreksi. Populasi berantai sudah tercatat di raw.
 */
export async function recomputeFlockCycle(flockId: bigint, client: Client = prisma) {
  const flock = await client.flock.findUniqueOrThrow({ where: { id: flockId } });
  const records = await client.dailyRecord.findMany({
    where: { flockId, deletedAt: null },
    include: { population: true, eggs: true, feed: true },
    orderBy: { recordDate: "asc" },
  });
  if (records.length === 0) return;

  const rows: DailyAggregateRow[] = records.map((r) => ({
    livePopulation: r.population?.openingPopulation ?? 0, // basis OPENING utk agregasi konsisten
    openingPopulation: r.population?.openingPopulation ?? 0,
    mortality: r.population?.mortality ?? 0,
    culling: r.population?.culling ?? 0,
    totalEggs: r.eggs?.totalEggs ?? 0,
    crackedEggs: r.eggs?.crackedEggs ?? 0,
    dirtyEggs: r.eggs?.dirtyEggs ?? 0,
    totalWeightKg: r.eggs?.totalWeightKg.toNumber() ?? 0,
    feedConsumedKg: r.feed?.feedConsumedKg.toNumber() ?? 0,
    feedCost: r.feed?.pricePerKg && r.feed?.feedConsumedKg
      ? r.feed.feedConsumedKg.toNumber() * r.feed.pricePerKg.toNumber()
      : null,
  }));

  const agg = aggregatePeriod(rows);
  const totalMort = rows.reduce((s, r) => s + r.mortality, 0);
  const totalCull = rows.reduce((s, r) => s + r.culling, 0);
  const init = flock.initialPopulation;

  const first = records[0].recordDate;
  const last = records[records.length - 1].recordDate;

  await client.productivitySummary.upsert({
    where: { flockId_periodType_periodKey: { flockId, periodType: "CYCLE", periodKey: "CYCLE" } },
    create: {
      flockId, houseId: flock.houseId, periodType: "CYCLE", periodKey: "CYCLE",
      periodStart: first, periodEnd: last,
      avgPopulation: D(agg.avgPopulation), totalEggs: agg.totalEggs,
      totalEggWeightKg: D(agg.totalWeightKg), hdpPct: D(agg.hdpPct),
      hhpPct: D(henHousedEggs(agg.totalEggs, init) !== null ? (agg.totalEggs / init) * 100 : null),
      eggMassG: D(cumulativeEggMass(agg.totalWeightKg, init)),
      feedIntakeG: D(agg.feedIntakeG), fcr: D(fcrFn(agg.feedConsumedKg, agg.totalWeightKg)),
      avgEggWeightG: D(agg.avgEggWeightG),
      mortalityPct: D(agg.mortalityPct),
      cumMortalityPct: D(cumulativeMortality(totalMort, init)),
      depletionPct: D(depletion(totalMort, totalCull, init)),
      crackedPct: D(agg.crackedPct), dirtyPct: D(agg.dirtyPct),
      feedConsumedKg: D(agg.feedConsumedKg), feedCost: D(agg.feedCost), isStale: false,
    },
    update: {
      periodStart: first, periodEnd: last,
      avgPopulation: D(agg.avgPopulation), totalEggs: agg.totalEggs,
      totalEggWeightKg: D(agg.totalWeightKg), hdpPct: D(agg.hdpPct),
      eggMassG: D(cumulativeEggMass(agg.totalWeightKg, init)),
      feedIntakeG: D(agg.feedIntakeG), fcr: D(fcrFn(agg.feedConsumedKg, agg.totalWeightKg)),
      avgEggWeightG: D(agg.avgEggWeightG),
      mortalityPct: D(agg.mortalityPct),
      cumMortalityPct: D(cumulativeMortality(totalMort, init)),
      depletionPct: D(depletion(totalMort, totalCull, init)),
      crackedPct: D(agg.crackedPct), dirtyPct: D(agg.dirtyPct),
      feedConsumedKg: D(agg.feedConsumedKg), feedCost: D(agg.feedCost),
      isStale: false, computedAt: new Date(),
    },
  });
}
