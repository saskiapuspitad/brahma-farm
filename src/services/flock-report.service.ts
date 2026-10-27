import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { computeAge } from "@/domain/indicators/age";
import {
  buildFlockSeries, type Grouping, type RawDay, type StandardTarget,
} from "@/domain/reports/flock-series";
import { getPopulationBasis } from "./settings.service";

const n = (v: { toNumber(): number } | null | undefined) => (v == null ? null : v.toNumber());

/** Data grafik lengkap untuk satu flock (harian atau mingguan), plus standar strain. */
export async function getFlockChartData(
  flockId: bigint,
  principal: AuthPrincipal,
  opts: { grouping: Grouping; from?: string; to?: string },
) {
  const flock = await prisma.flock.findUnique({
    where: { id: flockId },
    include: { strain: true, house: { select: { code: true, name: true } } },
  });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  // Semua recording siklus diambil (indikator kumulatif butuh data sejak awal); filter rentang di domain.
  const records = await prisma.dailyRecord.findMany({
    where: { flockId, deletedAt: null },
    include: { population: true, eggs: true, feed: true, water: true, environment: true },
    orderBy: { recordDate: "asc" },
  });

  const days: RawDay[] = records
    .filter((r) => r.population)
    .map((r) => {
      const age = computeAge(flock.hatchDate, r.recordDate);
      const pop = r.population!;
      const eggs = r.eggs;
      const feedKg = n(r.feed?.feedConsumedKg) ?? 0;
      const price = n(r.feed?.pricePerKg);
      return {
        date: r.recordDate.toISOString().slice(0, 10),
        ageDays: age.days,
        ageWeek: age.weeks,
        opening: pop.openingPopulation,
        closing: pop.closingPopulation,
        mortality: pop.mortality,
        culling: pop.culling,
        wholeEggs: eggs?.wholeEggs ?? 0,
        crackedEggs: eggs?.crackedEggs ?? 0,
        brokenEggs: eggs?.brokenEggs ?? 0,
        dirtyEggs: eggs?.dirtyEggs ?? 0,
        abnormalEggs: eggs?.abnormalEggs ?? 0,
        totalEggs: eggs?.totalEggs ?? 0,
        eggWeightKg: n(eggs?.totalWeightKg) ?? 0,
        feedKg,
        feedCost: price != null ? feedKg * price : null,
        waterL: n(r.water?.waterConsumptionL),
        tempAvg: n(r.environment?.tempAvg),
        humidityPct: n(r.environment?.humidityPct),
      };
    });

  const standards = await prisma.performanceStandard.findMany({ where: { strainId: flock.strainId } });
  const targets = new Map<number, StandardTarget>(
    standards.map((s) => [s.ageWeek, {
      hdpPct: n(s.hdpTarget),
      feedIntakeG: n(s.feedIntakeTargetG),
      eggWeightG: n(s.eggWeightTargetG),
      eggMassG: n(s.eggMassTargetG),
      fcr: n(s.fcrTarget),
      maxCumMortalityPct: n(s.maxMortalityPct),
    }]),
  );

  const basis = await getPopulationBasis(flock.farmId);
  const { points, summary } = buildFlockSeries(days, {
    initialPopulation: flock.initialPopulation, basis, grouping: opts.grouping, from: opts.from, to: opts.to,
  }, targets);

  const age = computeAge(flock.hatchDate, new Date());
  return {
    flock: {
      id: flock.id.toString(), code: flock.code, status: flock.status,
      strain: flock.strain.name, house: flock.house,
      initialPopulation: flock.initialPopulation,
      hatchDate: flock.hatchDate.toISOString().slice(0, 10),
      entryDate: flock.entryDate.toISOString().slice(0, 10),
      ageLabel: age.label,
    },
    grouping: opts.grouping,
    hasStandard: standards.length > 0,
    firstRecordDate: days[0]?.date ?? null,
    lastRecordDate: days[days.length - 1]?.date ?? null,
    summary,
    points,
  };
}
