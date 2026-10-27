import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess } from "@/lib/rbac";
import { conflict, notFound, validation } from "@/lib/errors";
import { computeAge } from "@/domain/indicators/age";
import {
  validateActivation, isValidTransition, completionEffects, entryAgeDays,
  validateReopen, validateDelete, suggestFlockCode,
  type FlockStatus,
} from "@/domain/flock/lifecycle";
import { writeAudit } from "./audit.service";
import type {
  CreateFlockInput, UpdateFlockInput, CompleteFlockInput, ReopenFlockInput, DeleteFlockInput,
} from "@/lib/zod/flock";

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

function scopeWhere(principal: AuthPrincipal, farmId?: string) {
  const where: Prisma.FlockWhereInput = { deletedAt: null };
  if (farmId) where.farmId = BigInt(farmId);
  if (!principal.roles.includes("SUPER_ADMIN")) {
    const allowed = principal.farmIds.filter(Boolean).map((f) => BigInt(f!));
    where.farmId = farmId ? BigInt(farmId) : { in: allowed };
  }
  return where;
}

export async function listFlocks(principal: AuthPrincipal, opts: { farmId?: string; houseId?: string; status?: string }) {
  const where = scopeWhere(principal, opts.farmId);
  if (opts.houseId) where.houseId = BigInt(opts.houseId);
  if (opts.status) where.status = opts.status as FlockStatus;

  const flocks = await prisma.flock.findMany({
    where,
    include: { strain: { select: { name: true } }, house: { select: { code: true, name: true } } },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });

  // Lampirkan umur terkini (dihitung dari hatchDate ke hari ini).
  const today = new Date();
  return flocks.map((f) => {
    const age = computeAge(f.hatchDate, today);
    return { ...f, ageDays: age.days, ageWeek: age.weeks, ageLabel: age.label };
  });
}

export async function getFlockDetail(id: bigint, principal: AuthPrincipal) {
  const flock = await prisma.flock.findUnique({
    where: { id },
    include: {
      strain: true,
      house: { select: { id: true, code: true, name: true } },
      assignments: { orderBy: { startDate: "desc" }, include: { house: { select: { code: true } } } },
      summaries: { where: { periodType: "DAILY" }, orderBy: { periodStart: "asc" } },
    },
  });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  const cycle = await prisma.productivitySummary.findUnique({
    where: { flockId_periodType_periodKey: { flockId: id, periodType: "CYCLE", periodKey: "CYCLE" } },
  });
  const treatmentCount = await prisma.treatment.count({ where: { flockId: id, deletedAt: null } });
  const recordCount = await prisma.dailyRecord.count({ where: { flockId: id, deletedAt: null } });
  const age = computeAge(flock.hatchDate, new Date());

  return { flock, age, cycle, treatmentCount, recordCount };
}

export async function createFlock(input: CreateFlockInput, principal: AuthPrincipal, ip?: string | null) {
  requireFarmAccess(principal, input.farmId.toString());
  const house = await prisma.house.findUnique({ where: { id: input.houseId } });
  if (!house || house.deletedAt) throw notFound("Kandang tidak ditemukan");
  if (house.farmId !== input.farmId) throw validation("Kandang bukan milik peternakan tersebut");

  const hatch = toDate(input.hatchDate);
  const entry = toDate(input.entryDate);
  if (entry < hatch) throw validation("Tanggal masuk tidak boleh lebih awal dari tanggal menetas", [{ field: "entryDate", message: "≥ tanggal menetas" }]);

  const dupCode = await prisma.flock.findFirst({ where: { farmId: input.farmId, code: input.code, deletedAt: null } });
  if (dupCode) throw conflict("Kode flock sudah dipakai di peternakan ini");

  if (house.status === "INACTIVE") throw validation("Kandang berstatus nonaktif");

  const willActivate = input.activate ?? false;
  if (willActivate) {
    // Kandang boleh sudah berisi flock aktif lain (beda umur, mis. A1 & A2).
    const errs = validateActivation({
      currentStatus: "PREPARATION",
      hatchDate: hatch, entryDate: entry, initialPopulation: input.initialPopulation,
    });
    if (errs.length > 0) throw validation("Tidak dapat mengaktifkan flock", errs);
  }

  const flock = await prisma.$transaction(async (tx) => {
    const f = await tx.flock.create({
      data: {
        farmId: input.farmId, houseId: input.houseId, code: input.code, strainId: input.strainId,
        sourceSupplier: input.sourceSupplier, hatchDate: hatch, entryDate: entry,
        entryAgeDays: entryAgeDays(hatch, entry), initialPopulation: input.initialPopulation,
        rearingType: input.rearingType, productionPhase: input.productionPhase,
        targetProductionNote: input.targetProductionNote,
        plannedCullDate: input.plannedCullDate ? toDate(input.plannedCullDate) : null,
        notes: input.notes, status: willActivate ? "ACTIVE" : "PREPARATION",
      },
    });
    if (willActivate) {
      await tx.houseAssignment.create({ data: { houseId: input.houseId, flockId: f.id, startDate: entry } });
      await tx.house.update({ where: { id: input.houseId }, data: { status: "ACTIVE" } });
    }
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: f.id, action: "CREATE",
      newValues: { code: input.code, status: f.status }, ipAddress: ip }, tx);
    return f;
  });

  return flock;
}

export async function activateFlock(id: bigint, principal: AuthPrincipal, ip?: string | null) {
  const flock = await prisma.flock.findUnique({ where: { id } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  const errs = validateActivation({
    currentStatus: flock.status as FlockStatus,
    hatchDate: flock.hatchDate, entryDate: flock.entryDate, initialPopulation: flock.initialPopulation,
  });
  if (errs.length > 0) throw validation("Tidak dapat mengaktifkan flock", errs);

  return prisma.$transaction(async (tx) => {
    const f = await tx.flock.update({ where: { id }, data: { status: "ACTIVE" } });
    const openAssign = await tx.houseAssignment.findFirst({ where: { houseId: flock.houseId, flockId: id, endDate: null } });
    if (!openAssign) await tx.houseAssignment.create({ data: { houseId: flock.houseId, flockId: id, startDate: flock.entryDate } });
    await tx.house.update({ where: { id: flock.houseId }, data: { status: "ACTIVE" } });
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "UPDATE",
      oldValues: { status: flock.status }, newValues: { status: "ACTIVE" }, ipAddress: ip }, tx);
    return f;
  });
}

const todayUtc = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

/** Nonaktifkan flock: tutup siklus sebagai COMPLETED (selesai) atau CULLED (afkir). Data recording tetap tersimpan. */
export async function completeFlock(id: bigint, input: CompleteFlockInput, principal: AuthPrincipal, ip?: string | null) {
  const flock = await prisma.flock.findUnique({ where: { id } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  if (flock.status === input.status || !isValidTransition(flock.status as FlockStatus, input.status)) {
    throw validation(`Tidak dapat mengubah status dari ${flock.status} ke ${input.status}`);
  }
  const otherActive = await prisma.flock.count({
    where: { houseId: flock.houseId, status: "ACTIVE", deletedAt: null, id: { not: id } },
  });
  const eff = completionEffects(input.status, otherActive);
  const cullDate = input.actualCullDate ? toDate(input.actualCullDate) : todayUtc();
  if (cullDate < flock.entryDate) {
    throw validation("Tanggal nonaktif tidak boleh sebelum tanggal masuk", [{ field: "actualCullDate", message: "≥ tanggal masuk" }]);
  }
  if (cullDate > todayUtc()) {
    throw validation("Tanggal nonaktif tidak boleh di masa depan", [{ field: "actualCullDate", message: "≤ hari ini" }]);
  }

  return prisma.$transaction(async (tx) => {
    const f = await tx.flock.update({
      where: { id }, data: { status: input.status, actualCullDate: cullDate },
    });
    // Hanya flock yang sedang menempati kandang yang mengubah status kandang;
    // kandang tetap ACTIVE bila masih ada flock aktif lain di dalamnya.
    const open = await tx.houseAssignment.findFirst({ where: { houseId: flock.houseId, flockId: id, endDate: null } });
    if (eff.closeAssignment && open) {
      await tx.houseAssignment.update({ where: { id: open.id }, data: { endDate: cullDate } });
    }
    if (open || flock.status === "ACTIVE") {
      await tx.house.update({ where: { id: flock.houseId }, data: { status: eff.nextHouseStatus } });
    }
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "UPDATE",
      oldValues: { status: flock.status }, newValues: { status: input.status, actualCullDate: cullDate.toISOString().slice(0, 10) },
      reason: input.reason, ipAddress: ip }, tx);
    return f;
  });
}

/** Aktifkan kembali flock yang sudah dinonaktifkan (koreksi). */
export async function reopenFlock(id: bigint, input: ReopenFlockInput, principal: AuthPrincipal, ip?: string | null) {
  const flock = await prisma.flock.findUnique({ where: { id }, include: { house: true } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  const errs = validateReopen({
    currentStatus: flock.status as FlockStatus,
    houseUsable: !flock.house.deletedAt && flock.house.status !== "INACTIVE",
  });
  if (errs.length > 0) throw validation("Tidak dapat mengaktifkan kembali flock", errs);

  return prisma.$transaction(async (tx) => {
    const f = await tx.flock.update({ where: { id }, data: { status: "ACTIVE", actualCullDate: null } });
    const last = await tx.houseAssignment.findFirst({
      where: { houseId: flock.houseId, flockId: id }, orderBy: { startDate: "desc" },
    });
    if (last) {
      if (last.endDate) await tx.houseAssignment.update({ where: { id: last.id }, data: { endDate: null } });
    } else {
      await tx.houseAssignment.create({ data: { houseId: flock.houseId, flockId: id, startDate: flock.entryDate } });
    }
    await tx.house.update({ where: { id: flock.houseId }, data: { status: "ACTIVE" } });
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "UPDATE",
      oldValues: { status: flock.status, actualCullDate: flock.actualCullDate?.toISOString().slice(0, 10) ?? null },
      newValues: { status: "ACTIVE" }, reason: input.reason, ipAddress: ip }, tx);
    return f;
  });
}

/**
 * Hapus flock (soft delete) — hanya untuk flock tanpa recording & perlakuan,
 * mis. salah input. Kode dibebaskan agar bisa dipakai lagi.
 */
export async function deleteFlock(id: bigint, input: DeleteFlockInput, principal: AuthPrincipal, ip?: string | null) {
  const flock = await prisma.flock.findUnique({ where: { id } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  const [recordCount, treatmentCount] = await Promise.all([
    prisma.dailyRecord.count({ where: { flockId: id, deletedAt: null } }),
    prisma.treatment.count({ where: { flockId: id, deletedAt: null } }),
  ]);
  const errs = validateDelete({ recordCount, treatmentCount });
  if (errs.length > 0) throw validation(errs[0].message, errs);

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const open = await tx.houseAssignment.findFirst({ where: { houseId: flock.houseId, flockId: id, endDate: null } });
    if (open) {
      const end = todayUtc() < open.startDate ? open.startDate : todayUtc();
      await tx.houseAssignment.update({ where: { id: open.id }, data: { endDate: end, note: "Flock dihapus" } });
      // Belum ada produksi → kandang langsung kosong (tanpa sanitasi), kecuali masih ada flock aktif lain.
      const otherActive = await tx.flock.count({
        where: { houseId: flock.houseId, status: "ACTIVE", deletedAt: null, id: { not: id } },
      });
      if (otherActive === 0) await tx.house.update({ where: { id: flock.houseId }, data: { status: "EMPTY" } });
    }
    const f = await tx.flock.update({
      where: { id },
      data: { deletedAt: now, code: `${flock.code}~hapus-${id}` },
    });
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "DELETE",
      oldValues: { code: flock.code, status: flock.status }, reason: input.reason, ipAddress: ip }, tx);
    return f;
  });
}

export async function updateFlock(id: bigint, input: UpdateFlockInput, principal: AuthPrincipal, ip?: string | null) {
  const flock = await prisma.flock.findUnique({ where: { id } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  const hatch = input.hatchDate ? toDate(input.hatchDate) : flock.hatchDate;
  const entry = input.entryDate ? toDate(input.entryDate) : flock.entryDate;
  const changesHatch = hatch.getTime() !== flock.hatchDate.getTime();
  const changesEntry = entry.getTime() !== flock.entryDate.getTime();
  const changesPop = input.initialPopulation !== undefined && input.initialPopulation !== flock.initialPopulation;

  if (entry < hatch) {
    throw validation("Tanggal masuk tidak boleh lebih awal dari tanggal menetas", [{ field: "entryDate", message: "≥ tanggal menetas" }]);
  }
  // Tanggal & populasi awal dipakai untuk menghitung umur, HDP, dan populasi harian.
  // Bila sudah ada recording, ubahan ini akan membuat data lama tidak konsisten.
  if (changesHatch || changesEntry || changesPop) {
    const recordCount = await prisma.dailyRecord.count({ where: { flockId: id, deletedAt: null } });
    if (recordCount > 0) {
      throw validation("Tanggal menetas, tanggal masuk, dan populasi awal tidak dapat diubah karena flock sudah memiliki recording");
    }
  }
  if (input.code && input.code !== flock.code) {
    const dup = await prisma.flock.findFirst({ where: { farmId: flock.farmId, code: input.code, deletedAt: null, id: { not: id } } });
    if (dup) throw conflict("Kode flock sudah dipakai di peternakan ini");
  }
  if (input.strainId) {
    const strain = await prisma.strain.findUnique({ where: { id: input.strainId } });
    if (!strain || strain.deletedAt) throw notFound("Strain tidak ditemukan");
  }

  const data: Prisma.FlockUpdateInput = {};
  if (input.code) data.code = input.code;
  if (input.strainId) data.strain = { connect: { id: input.strainId } };
  if (input.sourceSupplier !== undefined) data.sourceSupplier = input.sourceSupplier || null;
  if (changesHatch) data.hatchDate = hatch;
  if (changesEntry) data.entryDate = entry;
  if (changesHatch || changesEntry) data.entryAgeDays = entryAgeDays(hatch, entry);
  if (changesPop) data.initialPopulation = input.initialPopulation;
  if (input.productionPhase) data.productionPhase = input.productionPhase;
  if (input.rearingType) data.rearingType = input.rearingType;
  if (input.targetProductionNote !== undefined) data.targetProductionNote = input.targetProductionNote || null;
  if (input.plannedCullDate !== undefined) data.plannedCullDate = input.plannedCullDate ? toDate(input.plannedCullDate) : null;
  if (input.notes !== undefined) data.notes = input.notes || null;

  const { reason, ...newValues } = input;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.flock.update({ where: { id }, data });
    // Jaga konsistensi riwayat penempatan bila tanggal masuk dikoreksi (hanya mungkin sebelum ada recording).
    if (changesEntry) {
      await tx.houseAssignment.updateMany({
        where: { flockId: id, houseId: flock.houseId, startDate: flock.entryDate }, data: { startDate: entry },
      });
    }
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "UPDATE",
      oldValues: {
        code: flock.code, strainId: flock.strainId.toString(), hatchDate: flock.hatchDate.toISOString().slice(0, 10),
        entryDate: flock.entryDate.toISOString().slice(0, 10), initialPopulation: flock.initialPopulation,
        productionPhase: flock.productionPhase,
      },
      newValues: { ...newValues, strainId: newValues.strainId?.toString() },
      reason: reason ?? null, ipAddress: ip }, tx);
    return updated;
  });
}

/** Saran kode flock berikutnya untuk kandang tertentu (mis. A1, A2 → A3). */
export async function suggestCodeForHouse(houseId: bigint, principal: AuthPrincipal) {
  const house = await prisma.house.findUnique({ where: { id: houseId } });
  if (!house || house.deletedAt) throw notFound("Kandang tidak ditemukan");
  requireFarmAccess(principal, house.farmId.toString());
  const [inHouse, inFarm] = await Promise.all([
    prisma.flock.findMany({ where: { houseId, deletedAt: null }, select: { code: true } }),
    prisma.flock.findMany({ where: { farmId: house.farmId, deletedAt: null }, select: { code: true } }),
  ]);
  return { code: suggestFlockCode(house.code, inHouse.map((f) => f.code), inFarm.map((f) => f.code)) };
}
