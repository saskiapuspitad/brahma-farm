import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";

/** Ringkasan KPI + seri grafik untuk dashboard. */
export async function getDashboard(
  principal: AuthPrincipal,
  opts: { farmId?: bigint; from?: string; to?: string }
) {
  const farmScope: { in?: bigint[]; equals?: bigint } = principal.roles.includes("SUPER_ADMIN")
    ? opts.farmId
      ? { equals: opts.farmId }
      : {}
    : { in: principal.farmIds.filter(Boolean).map((f) => BigInt(f!)) };

  const farmWhere = opts.farmId ? { farmId: opts.farmId } : farmScope.in ? { farmId: { in: farmScope.in } } : {};

  const [activeHouses, activeFlocks, flocks] = await Promise.all([
    prisma.house.count({ where: { ...farmWhere, status: "ACTIVE", deletedAt: null } }),
    prisma.flock.count({ where: { ...farmWhere, status: "ACTIVE", deletedAt: null } }),
    prisma.flock.findMany({ where: { ...farmWhere, status: "ACTIVE", deletedAt: null }, select: { id: true, houseId: true } }),
  ]);

  const today = (opts.to ?? new Date().toISOString().slice(0, 10));
  const todayDate = new Date(`${today}T00:00:00Z`);

  // Recording hari ini (untuk KPI harian & kandang belum input).
  const todayRecords = await prisma.dailyRecord.findMany({
    where: { ...farmWhere, recordDate: todayDate, deletedAt: null },
    include: { population: true, eggs: true },
  });
  const dailySummaries = await prisma.productivitySummary.findMany({
    where: { periodType: "DAILY", periodStart: todayDate, flockId: { in: flocks.map((f) => f.id) } },
  });

  const eggsToday = todayRecords.reduce((s, r) => s + (r.eggs?.totalEggs ?? 0), 0);
  const totalLivePopulation = todayRecords.reduce((s, r) => s + (r.population?.closingPopulation ?? 0), 0);
  const mortalityToday = todayRecords.reduce((s, r) => s + (r.population?.mortality ?? 0), 0);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const avgHdp = avg(dailySummaries.filter((s) => s.hdpPct != null).map((s) => Number(s.hdpPct)));
  const avgFcr = avg(dailySummaries.filter((s) => s.fcr != null).map((s) => Number(s.fcr)));
  const avgFeed = avg(dailySummaries.filter((s) => s.feedIntakeG != null).map((s) => Number(s.feedIntakeG)));

  const recordedHouseIds = new Set(todayRecords.map((r) => r.houseId.toString()));
  const pendingRecordHouses = flocks
    .filter((f) => !recordedHouseIds.has(f.houseId.toString()))
    .map((f) => ({ houseId: f.houseId.toString() }));

  const openAlerts = await prisma.alert.findMany({
    where: { ...farmWhere, status: "OPEN" },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 10,
  });

  const ongoingTreatments = await prisma.treatment.count({ where: { ...farmWhere, status: "ONGOING", deletedAt: null } });
  const withdrawalWarnings = await prisma.treatment.count({
    where: { ...farmWhere, withdrawalUntil: { gte: todayDate }, deletedAt: null },
  });

  // Seri grafik: HDP & FCR vs umur (mingguan) dari ringkasan harian.
  const series = await prisma.productivitySummary.findMany({
    where: { periodType: "DAILY", flockId: { in: flocks.map((f) => f.id) }, ageWeek: { not: null } },
    orderBy: { ageWeek: "asc" },
    select: { ageWeek: true, hdpPct: true, fcr: true, eggMassG: true, feedIntakeG: true },
  });

  return {
    kpi: {
      activeHouses, activeFlocks, totalLivePopulation, eggsToday,
      avgHdp: round(avgHdp), avgFcr: round(avgFcr), avgFeedIntakeG: round(avgFeed), mortalityToday,
    },
    pendingRecordHouses,
    abnormalHouses: openAlerts.filter((a) => a.severity !== "INFO").map((a) => ({ houseId: a.houseId?.toString() ?? null, alert: a.alertType })),
    ongoingTreatments,
    withdrawalWarnings,
    alerts: openAlerts.map((a) => ({ id: a.id.toString(), type: a.alertType, severity: a.severity, message: a.message })),
    charts: {
      hdpByAge: series.filter((s) => s.hdpPct != null).map((s) => ({ ageWeek: s.ageWeek, value: Number(s.hdpPct) })),
      fcrByAge: series.filter((s) => s.fcr != null).map((s) => ({ ageWeek: s.ageWeek, value: Number(s.fcr) })),
      eggMassByAge: series.filter((s) => s.eggMassG != null).map((s) => ({ ageWeek: s.ageWeek, value: Number(s.eggMassG) })),
      feedByAge: series.filter((s) => s.feedIntakeG != null).map((s) => ({ ageWeek: s.ageWeek, value: Number(s.feedIntakeG) })),
    },
  };
}

function round(n: number | null): number | null {
  return n === null ? null : Math.round((n + Number.EPSILON) * 100) / 100;
}
