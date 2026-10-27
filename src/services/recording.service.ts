import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { validatePopulation, closingPopulation } from "@/domain/indicators/population";
import { ageInDays, computeAge } from "@/domain/indicators/age";
import { evaluateAlerts, type AlertCandidate } from "@/domain/alerts/rules";
import { avgEggWeight } from "@/domain/indicators/formulas";
import { conflict, notFound, validation } from "@/lib/errors";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess } from "@/lib/rbac";
import { getThresholds } from "./settings.service";
import { computeAndStoreDaily, recomputeFlockCycle } from "./indicator.service";
import { writeAudit } from "./audit.service";
import type { CreateRecordingInput } from "@/lib/zod/recording";

export interface RecordingResult {
  id: string;
  status: string;
  closingPopulation: number;
  indicators: Record<string, number | null>;
  alerts: AlertCandidate[];
  warnings: string[];
}

/**
 * Data untuk mengisi form (prefill): flock, umur, populasi awal, target.
 * Satu kandang bisa berisi beberapa flock aktif, jadi prefill dipilih per flock.
 * `houseId` saja hanya diterima bila kandang berisi tepat satu flock aktif.
 */
export async function getPrefill(
  sel: { flockId?: bigint; houseId?: bigint },
  dateStr: string,
  principal: AuthPrincipal,
) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  let flock;
  if (sel.flockId) {
    flock = await prisma.flock.findUnique({ where: { id: sel.flockId }, include: { strain: true, house: true } });
    if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
    requireFarmAccess(principal, flock.farmId.toString());
    if (flock.status !== "ACTIVE") throw validation("Flock tidak aktif; recording hanya untuk flock berstatus Aktif");
  } else if (sel.houseId) {
    const house = await prisma.house.findUnique({ where: { id: sel.houseId } });
    if (!house || house.deletedAt) throw notFound("Kandang tidak ditemukan");
    requireFarmAccess(principal, house.farmId.toString());
    const actives = await prisma.flock.findMany({
      where: { houseId: sel.houseId, status: "ACTIVE", deletedAt: null },
      include: { strain: true, house: true },
    });
    if (actives.length === 0) throw notFound("Tidak ada flock aktif pada kandang ini");
    if (actives.length > 1) {
      throw validation(`Kandang ${house.code} berisi ${actives.length} flock aktif (${actives.map((f) => f.code).join(", ")}); pilih flock-nya`);
    }
    flock = actives[0];
  } else {
    throw validation("Parameter flockId wajib diisi");
  }

  if (ageInDays(flock.hatchDate, date) < 0) throw validation("Tanggal lebih awal dari tanggal menetas");
  const age = computeAge(flock.hatchDate, date);

  // Populasi awal = populasi akhir recording sebelumnya, atau populasi awal flock.
  const prev = await prisma.dailyRecord.findFirst({
    where: { flockId: flock.id, recordDate: { lt: date }, deletedAt: null },
    include: { population: true, feed: true },
    orderBy: { recordDate: "desc" },
  });
  const openingPopulation = prev?.population?.closingPopulation ?? flock.initialPopulation;

  const target = await prisma.performanceStandard.findUnique({
    where: { strainId_ageWeek: { strainId: flock.strainId, ageWeek: age.weeks } },
  });

  return {
    flock: { id: flock.id.toString(), code: flock.code, strainId: flock.strainId.toString(), strain: flock.strain.name },
    house: { id: flock.houseId.toString(), code: flock.house.code, name: flock.house.name },
    ageDays: age.days,
    ageWeek: age.weeks,
    ageLabel: age.label,
    openingPopulation,
    defaults: {
      feedTypeId: prev?.feed?.feedTypeId?.toString() ?? null,
      openingStockKg: prev?.feed ? Number(prev.feed.feedLeftoverKg) : 0,
      pricePerKg: prev?.feed?.pricePerKg ? Number(prev.feed.pricePerKg) : null,
    },
    targetForAge: target
      ? { hdpTarget: target.hdpTarget ? Number(target.hdpTarget) : null, fcrTarget: target.fcrTarget ? Number(target.fcrTarget) : null }
      : null,
  };
}

/** Buat recording harian dalam satu transaksi: validasi → simpan → indikator → alert → audit. */
export async function createRecording(
  input: CreateRecordingInput,
  principal: AuthPrincipal,
  ipAddress?: string | null
): Promise<RecordingResult> {
  const warnings: string[] = [];
  const recordDate = new Date(`${input.recordDate}T00:00:00.000Z`);

  const flock = await prisma.flock.findUnique({ where: { id: input.flockId }, include: { strain: true } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());
  if (flock.houseId !== input.houseId) throw validation("Flock tidak berada di kandang tersebut");

  // Aturan: recording setelah flock selesai butuh otorisasi admin.
  if ((flock.status === "COMPLETED" || flock.status === "CULLED") && !input.force) {
    throw validation("Flock sudah selesai/afkir; butuh otorisasi admin (force + alasan)");
  }
  if (ageInDays(flock.hatchDate, recordDate) < 0) {
    throw validation("Tanggal recording lebih awal dari tanggal menetas");
  }

  // Cegah duplikat (flock, tanggal).
  const dup = await prisma.dailyRecord.findFirst({
    where: { flockId: input.flockId, recordDate, deletedAt: null },
  });
  if (dup) throw conflict("Recording untuk flock & tanggal ini sudah ada");

  // Propagasi populasi awal dari recording sebelumnya.
  const prev = await prisma.dailyRecord.findFirst({
    where: { flockId: input.flockId, recordDate: { lt: recordDate }, deletedAt: null },
    include: { population: true, eggs: true },
    orderBy: { recordDate: "desc" },
  });
  const expectedOpening = prev?.population?.closingPopulation ?? flock.initialPopulation;
  const opening = input.population.openingPopulation;
  if (opening !== expectedOpening) {
    warnings.push(`Populasi awal (${opening}) tidak sama dengan populasi akhir sebelumnya (${expectedOpening}).`);
    if (!input.force) {
      throw validation(`Populasi awal harus ${expectedOpening} (sesuai populasi akhir sebelumnya). Gunakan koreksi/force dengan alasan bila memang berbeda.`);
    }
  }

  // Validasi mutasi populasi (domain).
  const popErrors = validatePopulation({
    openingPopulation: opening,
    mortality: input.population.mortality,
    culling: input.population.culling,
    transferIn: input.population.transferIn,
    transferOut: input.population.transferOut,
  });
  if (popErrors.length > 0) throw validation("Mutasi populasi tidak valid", popErrors);
  const closing = closingPopulation({
    openingPopulation: opening,
    mortality: input.population.mortality,
    culling: input.population.culling,
    transferIn: input.population.transferIn,
    transferOut: input.population.transferOut,
  });

  // Total telur = jumlah kategori (dihitung server, bukan dari input).
  const e = input.eggs;
  const totalEggs = e.wholeEggs + e.crackedEggs + e.brokenEggs + e.dirtyEggs + e.abnormalEggs;

  // Konsumsi pakan: pakai input, atau turunkan dari given - leftover bila 0.
  const f = input.feed;
  const feedConsumed = f.feedConsumedKg > 0 ? f.feedConsumedKg : Math.max(0, f.feedGivenKg - f.feedLeftoverKg);

  const age = computeAge(flock.hatchDate, recordDate);

  // Simpan dalam transaksi.
  const record = await prisma.$transaction(async (tx) => {
    const rec = await tx.dailyRecord.create({
      data: {
        farmId: flock.farmId,
        houseId: input.houseId,
        flockId: input.flockId,
        recordDate,
        ageDays: age.days,
        recordedBy: BigInt(principal.userId),
        status: "SUBMITTED",
        generalNote: input.generalNote,
        population: {
          create: {
            openingPopulation: opening,
            mortality: input.population.mortality,
            culling: input.population.culling,
            transferIn: input.population.transferIn,
            transferOut: input.population.transferOut,
            closingPopulation: closing,
          },
        },
        eggs: {
          create: {
            wholeEggs: e.wholeEggs, crackedEggs: e.crackedEggs, brokenEggs: e.brokenEggs,
            dirtyEggs: e.dirtyEggs, abnormalEggs: e.abnormalEggs, totalEggs,
            totalWeightKg: new Prisma.Decimal(e.totalWeightKg),
            sampleWeightG: e.sampleWeightG != null ? new Prisma.Decimal(e.sampleWeightG) : null,
            trays: e.trays ?? null,
          },
        },
        feed: {
          create: {
            feedTypeId: f.feedTypeId ?? null,
            openingStockKg: new Prisma.Decimal(f.openingStockKg),
            feedInKg: new Prisma.Decimal(f.feedInKg),
            feedGivenKg: new Prisma.Decimal(f.feedGivenKg),
            feedLeftoverKg: new Prisma.Decimal(f.feedLeftoverKg),
            feedConsumedKg: new Prisma.Decimal(feedConsumed),
            batchCode: f.batchCode,
            pricePerKg: f.pricePerKg != null ? new Prisma.Decimal(f.pricePerKg) : null,
          },
        },
        ...(input.water
          ? { water: { create: { waterConsumptionL: input.water.waterConsumptionL != null ? new Prisma.Decimal(input.water.waterConsumptionL) : null, note: input.water.note } } }
          : {}),
        ...(input.environment
          ? { environment: { create: {
              tempMin: dec(input.environment.tempMin), tempMax: dec(input.environment.tempMax), tempAvg: dec(input.environment.tempAvg),
              humidityPct: dec(input.environment.humidityPct), thi: dec(input.environment.thi), lightHours: dec(input.environment.lightHours),
              ventilationNote: input.environment.ventilationNote, weatherNote: input.environment.weatherNote,
            } } }
          : {}),
      },
    });

    await writeAudit(
      { userId: BigInt(principal.userId), entityType: "DailyRecord", entityId: rec.id, action: "CREATE",
        newValues: { recordDate: input.recordDate, totalEggs, closing }, reason: input.reason ?? null, ipAddress },
      tx
    );

    return rec;
  });

  // Indikator (di luar tx create agar upsert summary sederhana; tetap idempotent).
  const ind = await computeAndStoreDaily(record.id);
  await recomputeFlockCycle(input.flockId);

  // Evaluasi peringatan.
  const alerts = await evaluateAndPersistAlerts({
    flock, record, indicators: ind, prevEggs: prev?.eggs ? { totalWeightKg: Number(prev.eggs.totalWeightKg), totalEggs: prev.eggs.totalEggs } : null,
    ageWeek: age.weeks,
  });

  return {
    id: record.id.toString(),
    status: record.status,
    closingPopulation: closing,
    indicators: {
      hdpPct: ind.hdpPct, hhpPct: ind.hhpPct, eggMassG: ind.eggMassG, feedIntakeG: ind.feedIntakeG,
      fcr: ind.fcr, avgEggWeightG: ind.avgEggWeightG, mortalityPct: ind.mortalityPct,
    },
    alerts,
    warnings,
  };
}

function dec(v?: number): Prisma.Decimal | null {
  return v != null ? new Prisma.Decimal(v) : null;
}

interface EvalArgs {
  flock: { id: bigint; farmId: bigint; houseId: bigint; strainId: bigint };
  record: { id: bigint; recordDate: Date };
  indicators: { hdpPct: number | null; fcr: number | null; mortalityPct: number | null; feedIntakeG: number | null; avgEggWeightG: number | null };
  prevEggs: { totalWeightKg: number; totalEggs: number } | null;
  ageWeek: number;
}

async function evaluateAndPersistAlerts(args: EvalArgs): Promise<AlertCandidate[]> {
  const thresholds = await getThresholds(args.flock.farmId);
  const target = await prisma.performanceStandard.findUnique({
    where: { strainId_ageWeek: { strainId: args.flock.strainId, ageWeek: args.ageWeek } },
  });
  // Rata-rata bergerak konsumsi pakan 7 hari terakhir.
  const recent = await prisma.productivitySummary.findMany({
    where: { flockId: args.flock.id, periodType: "DAILY", feedIntakeG: { not: null } },
    orderBy: { periodStart: "desc" }, take: 7,
  });
  const movingAvg = recent.length ? recent.reduce((s, r) => s + Number(r.feedIntakeG), 0) / recent.length : null;
  const prevEggWeight = args.prevEggs ? avgEggWeight(args.prevEggs.totalWeightKg, args.prevEggs.totalEggs) : null;

  const candidates = evaluateAlerts(
    {
      hdpPct: args.indicators.hdpPct,
      hdpTarget: target?.hdpTarget ? Number(target.hdpTarget) : null,
      fcr: args.indicators.fcr,
      fcrTarget: target?.fcrTarget ? Number(target.fcrTarget) : null,
      mortalityPct: args.indicators.mortalityPct,
      feedIntakeG: args.indicators.feedIntakeG,
      feedIntakeMovingAvgG: movingAvg,
      avgEggWeightG: args.indicators.avgEggWeightG,
      avgEggWeightPrevG: prevEggWeight,
      abnormalEggPct: null,
      populationConsistent: true,
      withdrawalActive: false,
    },
    thresholds
  );

  if (candidates.length > 0) {
    await prisma.alert.createMany({
      data: candidates.map((c) => ({
        farmId: args.flock.farmId, houseId: args.flock.houseId, flockId: args.flock.id,
        alertType: c.type, severity: c.severity, status: "OPEN" as const,
        recordDate: args.record.recordDate, message: c.message, context: c.context as Prisma.InputJsonValue,
      })),
    });
  }
  return candidates;
}
