import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess, isSuperAdmin } from "@/lib/rbac";
import { locked, notFound, validation, forbidden } from "@/lib/errors";
import { validatePopulation, closingPopulation } from "@/domain/indicators/population";
import { computeAge } from "@/domain/indicators/age";
import { writeAudit } from "./audit.service";
import { computeAndStoreDaily, recomputeFlockCycle } from "./indicator.service";
import type { CorrectRecordingInput } from "@/lib/zod/recording";

/**
 * Koreksi recording: wajib alasan → audit (old/new). Menghitung ulang populasi
 * berantai (opening hari berikut = closing hari ini) untuk seluruh recording
 * flock sejak tanggal yang dikoreksi, lalu recompute ringkasan.
 */
export async function correctRecording(
  id: bigint,
  input: CorrectRecordingInput,
  principal: AuthPrincipal,
  ip?: string | null
) {
  const rec = await prisma.dailyRecord.findUnique({
    where: { id },
    include: { population: true, eggs: true, feed: true, flock: true },
  });
  if (!rec || rec.deletedAt) throw notFound("Recording tidak ditemukan");
  requireFarmAccess(principal, rec.farmId.toString());

  if (rec.status === "LOCKED" && !isSuperAdmin(principal)) {
    throw locked("Recording terkunci; hanya Super Admin yang dapat mengoreksi setelah membuka kunci");
  }

  const oldValues = {
    population: rec.population, eggs: rec.eggs, feed: rec.feed, generalNote: rec.generalNote,
  };

  // Susun nilai baru (merge dgn lama bila field tidak dikirim).
  const p = input.population;
  const newOpening = p?.openingPopulation ?? rec.population?.openingPopulation ?? 0;
  const mortality = p?.mortality ?? rec.population?.mortality ?? 0;
  const culling = p?.culling ?? rec.population?.culling ?? 0;
  const transferIn = p?.transferIn ?? rec.population?.transferIn ?? 0;
  const transferOut = p?.transferOut ?? rec.population?.transferOut ?? 0;

  const popErrors = validatePopulation({ openingPopulation: newOpening, mortality, culling, transferIn, transferOut });
  if (popErrors.length > 0) throw validation("Mutasi populasi tidak valid", popErrors);
  const newClosing = closingPopulation({ openingPopulation: newOpening, mortality, culling, transferIn, transferOut });

  const e = input.eggs;
  const whole = e?.wholeEggs ?? rec.eggs?.wholeEggs ?? 0;
  const cracked = e?.crackedEggs ?? rec.eggs?.crackedEggs ?? 0;
  const broken = e?.brokenEggs ?? rec.eggs?.brokenEggs ?? 0;
  const dirty = e?.dirtyEggs ?? rec.eggs?.dirtyEggs ?? 0;
  const abnormal = e?.abnormalEggs ?? rec.eggs?.abnormalEggs ?? 0;
  const totalEggs = whole + cracked + broken + dirty + abnormal;
  const totalWeightKg = e?.totalWeightKg ?? (rec.eggs ? Number(rec.eggs.totalWeightKg) : 0);

  const f = input.feed;
  const feedConsumed = f?.feedConsumedKg ?? (rec.feed ? Number(rec.feed.feedConsumedKg) : 0);
  const pricePerKg = f?.pricePerKg ?? (rec.feed?.pricePerKg ? Number(rec.feed.pricePerKg) : null);

  await prisma.$transaction(async (tx) => {
    await tx.dailyPopulation.update({
      where: { dailyRecordId: id },
      data: { openingPopulation: newOpening, mortality, culling, transferIn, transferOut, closingPopulation: newClosing },
    });
    await tx.eggProduction.update({
      where: { dailyRecordId: id },
      data: {
        wholeEggs: whole, crackedEggs: cracked, brokenEggs: broken, dirtyEggs: dirty, abnormalEggs: abnormal,
        totalEggs, totalWeightKg: new Prisma.Decimal(totalWeightKg),
      },
    });
    if (rec.feed) {
      await tx.feedRecord.update({
        where: { dailyRecordId: id },
        data: { feedConsumedKg: new Prisma.Decimal(feedConsumed), pricePerKg: pricePerKg != null ? new Prisma.Decimal(pricePerKg) : null },
      });
    }
    if (input.generalNote !== undefined) {
      await tx.dailyRecord.update({ where: { id }, data: { generalNote: input.generalNote } });
    }
    await writeAudit({
      userId: BigInt(principal.userId), entityType: "DailyRecord", entityId: id, action: "UPDATE",
      oldValues: JSON.parse(JSON.stringify(oldValues, bigintReplacer)),
      newValues: { openingPopulation: newOpening, closing: newClosing, totalEggs, totalWeightKg, feedConsumed },
      reason: input.reason, ipAddress: ip,
    }, tx);
  });

  // Recompute berantai populasi + ringkasan sejak tanggal ini.
  await recomputePopulationChain(rec.flockId, rec.recordDate);
  await recomputeFlockCycle(rec.flockId);

  return { id: id.toString(), closingPopulation: newClosing };
}

/**
 * Perbaiki opening berantai: untuk tiap recording flock sejak fromDate (urut),
 * set opening = closing recording sebelumnya (atau initial_population utk yg pertama),
 * hitung ulang closing & simpan, lalu recompute ringkasan harian tiap record.
 */
export async function recomputePopulationChain(flockId: bigint, fromDate: Date) {
  const flock = await prisma.flock.findUniqueOrThrow({ where: { id: flockId } });
  const records = await prisma.dailyRecord.findMany({
    where: { flockId, deletedAt: null },
    include: { population: true },
    orderBy: { recordDate: "asc" },
  });

  // Cari opening awal untuk record pertama pada/после fromDate.
  let prevClosing: number | null = null;
  for (const r of records) {
    if (!r.population) continue;
    if (r.recordDate < fromDate) { prevClosing = r.population.closingPopulation; continue; }

    const opening = prevClosing ?? flock.initialPopulation;
    const closing = closingPopulation({
      openingPopulation: opening,
      mortality: r.population.mortality, culling: r.population.culling,
      transferIn: r.population.transferIn, transferOut: r.population.transferOut,
    });
    if (opening !== r.population.openingPopulation || closing !== r.population.closingPopulation) {
      await prisma.dailyPopulation.update({
        where: { dailyRecordId: r.id },
        data: { openingPopulation: opening, closingPopulation: closing },
      });
    }
    await computeAndStoreDaily(r.id);
    prevClosing = closing;
  }
}

export async function verifyRecording(id: bigint, principal: AuthPrincipal, ip?: string | null) {
  const rec = await prisma.dailyRecord.findUnique({ where: { id } });
  if (!rec || rec.deletedAt) throw notFound("Recording tidak ditemukan");
  requireFarmAccess(principal, rec.farmId.toString());
  if (rec.status === "LOCKED") throw locked("Recording sudah terkunci");
  const updated = await prisma.dailyRecord.update({
    where: { id }, data: { status: "VERIFIED", verifiedBy: BigInt(principal.userId), verifiedAt: new Date() },
  });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "DailyRecord", entityId: id, action: "VERIFY",
    oldValues: { status: rec.status }, newValues: { status: "VERIFIED" }, ipAddress: ip });
  return updated;
}

/** Kunci periode: kunci semua recording flock dalam rentang [from,to]. */
export async function lockPeriod(
  flockId: bigint, from: Date, to: Date, principal: AuthPrincipal, ip?: string | null
) {
  const flock = await prisma.flock.findUnique({ where: { id: flockId } });
  if (!flock) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());
  const res = await prisma.dailyRecord.updateMany({
    where: { flockId, recordDate: { gte: from, lte: to }, deletedAt: null, status: { not: "LOCKED" } },
    data: { status: "LOCKED" },
  });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: flockId, action: "LOCK",
    newValues: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), count: res.count }, ipAddress: ip });
  return { locked: res.count };
}

/** Buka kunci — hanya Super Admin. */
export async function unlockPeriod(
  flockId: bigint, from: Date, to: Date, principal: AuthPrincipal, ip?: string | null
) {
  if (!isSuperAdmin(principal)) throw forbidden("Hanya Super Admin yang dapat membuka kunci");
  const res = await prisma.dailyRecord.updateMany({
    where: { flockId, recordDate: { gte: from, lte: to }, deletedAt: null, status: "LOCKED" },
    data: { status: "VERIFIED" },
  });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: flockId, action: "UNLOCK",
    newValues: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), count: res.count }, ipAddress: ip });
  return { unlocked: res.count };
}

function bigintReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
}
