import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { canAccessFarm } from "@/lib/rbac";
import { parseCsv } from "@/lib/csv";
import { validatePopulation, closingPopulation } from "@/domain/indicators/population";
import { ageInDays, computeAge } from "@/domain/indicators/age";
import { computeAndStoreDaily, recomputeFlockCycle } from "./indicator.service";

export interface ImportRowResult {
  row: number;
  status: "ok" | "error";
  data?: Record<string, unknown>;
  errors?: string[];
}
export interface ImportResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  results: ImportRowResult[];
  committed?: number;
}

const int = (s: string | undefined) => {
  const n = Number(s ?? "");
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};
const dec = (s: string | undefined) => {
  const n = Number(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Impor recording lama dari CSV. `commit=false` → hanya validasi & pratinjau.
 * Mencegah duplikasi (flock, tanggal) baik terhadap DB maupun antar-baris.
 */
export async function importRecordings(csv: string, principal: AuthPrincipal, commit: boolean): Promise<ImportResult> {
  const rows = parseCsv(csv);

  // Master lookup
  const farms = await prisma.farm.findMany({ where: { deletedAt: null }, select: { id: true, code: true } });
  const farmByCode = new Map(farms.map((f) => [f.code, f.id]));
  const houses = await prisma.house.findMany({ where: { deletedAt: null }, select: { id: true, code: true, farmId: true } });
  const houseByKey = new Map(houses.map((h) => [`${h.farmId}:${h.code}`, h.id]));
  const flocks = await prisma.flock.findMany({ where: { deletedAt: null }, select: { id: true, code: true, farmId: true, houseId: true, hatchDate: true, initialPopulation: true } });
  const flockByKey = new Map(flocks.map((f) => [`${f.farmId}:${f.code}`, f]));

  const seenInBatch = new Set<string>();
  const results: ImportRowResult[] = [];
  const validParsed: {
    farmId: bigint; houseId: bigint; flockId: bigint; recordDate: Date; ageDays: number;
    opening: number; mortality: number; culling: number; transferIn: number; transferOut: number; closing: number;
    whole: number; cracked: number; broken: number; dirty: number; abnormal: number; totalEggs: number;
    totalWeightKg: number; feedConsumed: number; pricePerKg: number | null;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const errors: string[] = [];
    const rowNo = i + 2; // +1 header, +1 1-index

    const farmId = farmByCode.get(r.farm_code);
    if (!farmId) errors.push(`farm_code '${r.farm_code}' tidak dikenal`);
    else if (!canAccessFarm(principal, farmId.toString())) errors.push("Di luar cakupan peternakan Anda");

    const houseId = farmId ? houseByKey.get(`${farmId}:${r.house_code}`) : undefined;
    if (farmId && !houseId) errors.push(`house_code '${r.house_code}' tidak ditemukan di peternakan`);

    const flock = farmId ? flockByKey.get(`${farmId}:${r.flock_code}`) : undefined;
    if (farmId && !flock) errors.push(`flock_code '${r.flock_code}' tidak ditemukan`);
    if (flock && houseId && flock.houseId !== houseId) errors.push("flock tidak berada di kandang tersebut");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.record_date ?? "")) errors.push("record_date harus YYYY-MM-DD");
    const recordDate = /^\d{4}-\d{2}-\d{2}$/.test(r.record_date ?? "") ? new Date(`${r.record_date}T00:00:00Z`) : null;

    if (flock && recordDate && ageInDays(flock.hatchDate, recordDate) < 0) errors.push("record_date lebih awal dari tanggal menetas");

    // Dedup
    if (flock && recordDate) {
      const key = `${flock.id}:${r.record_date}`;
      if (seenInBatch.has(key)) errors.push("duplikat dalam file (flock+tanggal)");
      seenInBatch.add(key);
    }

    const mortality = int(r.mortality) || 0;
    const culling = int(r.culling) || 0;
    const transferIn = int(r.transfer_in) || 0;
    const transferOut = int(r.transfer_out) || 0;
    let opening = r.opening_population ? int(r.opening_population) : NaN;

    const whole = int(r.whole_eggs) || 0;
    const cracked = int(r.cracked_eggs) || 0;
    const broken = int(r.broken_eggs) || 0;
    const dirty = int(r.dirty_eggs) || 0;
    const abnormal = int(r.abnormal_eggs) || 0;
    const totalEggs = whole + cracked + broken + dirty + abnormal;
    const totalWeightKg = r.total_weight_kg ? dec(r.total_weight_kg) : 0;
    const feedConsumed = r.feed_consumed_kg ? dec(r.feed_consumed_kg) : 0;
    const pricePerKg = r.price_per_kg ? dec(r.price_per_kg) : null;

    if ([mortality, culling, transferIn, transferOut].some((v) => Number.isNaN(v))) errors.push("nilai populasi tidak valid");
    if (Number.isNaN(totalWeightKg) || totalWeightKg < 0) errors.push("total_weight_kg tidak valid");
    if (Number.isNaN(feedConsumed) || feedConsumed < 0) errors.push("feed_consumed_kg tidak valid");

    // Jika opening kosong, akan dihitung dari propagasi saat commit; untuk validasi asumsikan valid.
    if (!Number.isNaN(opening)) {
      const popErr = validatePopulation({ openingPopulation: opening, mortality, culling, transferIn, transferOut });
      popErr.forEach((e) => errors.push(`${e.field}: ${e.message}`));
    } else {
      opening = -1; // penanda: hitung saat commit
    }

    // Dedup terhadap DB
    if (flock && recordDate && errors.length === 0) {
      const exists = await prisma.dailyRecord.findFirst({ where: { flockId: flock.id, recordDate, deletedAt: null } });
      if (exists) errors.push("recording untuk flock+tanggal sudah ada di database");
    }

    if (errors.length > 0 || !flock || !houseId || !farmId || !recordDate) {
      results.push({ row: rowNo, status: "error", errors: errors.length ? errors : ["data tidak lengkap"] });
      continue;
    }

    const closing = opening >= 0 ? closingPopulation({ openingPopulation: opening, mortality, culling, transferIn, transferOut }) : -1;
    results.push({ row: rowNo, status: "ok", data: { flock: r.flock_code, date: r.record_date, totalEggs } });
    validParsed.push({
      farmId, houseId, flockId: flock.id, recordDate, ageDays: computeAge(flock.hatchDate, recordDate).days,
      opening, mortality, culling, transferIn, transferOut, closing,
      whole, cracked, broken, dirty, abnormal, totalEggs, totalWeightKg, feedConsumed, pricePerKg,
    });
  }

  const validRows = validParsed.length;
  const invalidRows = rows.length - validRows;

  if (!commit) {
    return { totalRows: rows.length, validRows, invalidRows, results };
  }

  // COMMIT: urutkan per flock lalu tanggal agar propagasi opening benar.
  validParsed.sort((a, b) => (a.flockId === b.flockId ? +a.recordDate - +b.recordDate : Number(a.flockId - b.flockId)));

  let committed = 0;
  const touchedFlocks = new Set<string>();
  // Cache closing terakhir per flock utk propagasi opening kosong.
  const lastClosing = new Map<string, number>();

  for (const v of validParsed) {
    const fkey = v.flockId.toString();
    let opening = v.opening;
    if (opening < 0) {
      const cached = lastClosing.get(fkey);
      if (cached != null) opening = cached;
      else {
        const prev = await prisma.dailyRecord.findFirst({
          where: { flockId: v.flockId, recordDate: { lt: v.recordDate }, deletedAt: null },
          include: { population: true }, orderBy: { recordDate: "desc" },
        });
        opening = prev?.population?.closingPopulation ?? flocks.find((f) => f.id === v.flockId)!.initialPopulation;
      }
    }
    const closing = closingPopulation({ openingPopulation: opening, mortality: v.mortality, culling: v.culling, transferIn: v.transferIn, transferOut: v.transferOut });

    try {
      const rec = await prisma.$transaction(async (tx) => {
        return tx.dailyRecord.create({
          data: {
            farmId: v.farmId, houseId: v.houseId, flockId: v.flockId, recordDate: v.recordDate,
            ageDays: v.ageDays, recordedBy: BigInt(principal.userId), status: "SUBMITTED",
            population: { create: { openingPopulation: opening, mortality: v.mortality, culling: v.culling, transferIn: v.transferIn, transferOut: v.transferOut, closingPopulation: closing } },
            eggs: { create: { wholeEggs: v.whole, crackedEggs: v.cracked, brokenEggs: v.broken, dirtyEggs: v.dirty, abnormalEggs: v.abnormal, totalEggs: v.totalEggs, totalWeightKg: new Prisma.Decimal(v.totalWeightKg) } },
            feed: { create: { feedConsumedKg: new Prisma.Decimal(v.feedConsumed), pricePerKg: v.pricePerKg != null ? new Prisma.Decimal(v.pricePerKg) : null } },
          },
        });
      });
      await computeAndStoreDaily(rec.id);
      lastClosing.set(fkey, closing);
      touchedFlocks.add(fkey);
      committed++;
    } catch {
      // lewati baris yang gagal saat commit (mis. race duplikat)
    }
  }

  for (const fkey of touchedFlocks) {
    await recomputeFlockCycle(BigInt(fkey));
  }

  await prisma.importHistory.create({
    data: {
      userId: BigInt(principal.userId), importType: "RECORDING", fileName: "recordings.csv",
      totalRows: rows.length, successRows: committed, failedRows: rows.length - committed,
      status: committed === 0 ? "FAILED" : "DONE", finishedAt: new Date(),
    },
  });

  return { totalRows: rows.length, validRows, invalidRows, results, committed };
}
