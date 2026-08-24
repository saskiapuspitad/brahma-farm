import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess } from "@/lib/rbac";
import { conflict, notFound, validation } from "@/lib/errors";
import { computeAge } from "@/domain/indicators/age";
import {
  validateActivation, isValidTransition, completionEffects, entryAgeDays,
  type FlockStatus,
} from "@/domain/flock/lifecycle";
import { writeAudit } from "./audit.service";
import type { CreateFlockInput, UpdateFlockInput, CompleteFlockInput } from "@/lib/zod/flock";

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
  const age = computeAge(flock.hatchDate, new Date());

  return { flock, age, cycle, treatmentCount };
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

  let willActivate = input.activate ?? false;
  if (willActivate) {
    const activeInHouse = await prisma.flock.findFirst({ where: { houseId: input.houseId, status: "ACTIVE", deletedAt: null } });
    const errs = validateActivation({
      currentStatus: "PREPARATION", hasActiveFlockInHouse: !!activeInHouse,
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

  const activeInHouse = await prisma.flock.findFirst({
    where: { houseId: flock.houseId, status: "ACTIVE", deletedAt: null, id: { not: id } },
  });
  const errs = validateActivation({
    currentStatus: flock.status as FlockStatus, hasActiveFlockInHouse: !!activeInHouse,
    hatchDate: flock.hatchDate, entryDate: flock.entryDate, initialPopulation: flock.initialPopulation,
  });
  if (errs.length > 0) throw validation("Tidak dapat mengaktifkan flock", errs);

  return prisma.$transaction(async (tx) => {
    const f = await tx.flock.update({ where: { id }, data: { status: "ACTIVE" } });
    const openAssign = await tx.houseAssignment.findFirst({ where: { houseId: flock.houseId, endDate: null } });
    if (!openAssign) await tx.houseAssignment.create({ data: { houseId: flock.houseId, flockId: id, startDate: flock.entryDate } });
    await tx.house.update({ where: { id: flock.houseId }, data: { status: "ACTIVE" } });
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "UPDATE",
      oldValues: { status: flock.status }, newValues: { status: "ACTIVE" }, ipAddress: ip }, tx);
    return f;
  });
}

export async function completeFlock(id: bigint, input: CompleteFlockInput, principal: AuthPrincipal, ip?: string | null) {
  const flock = await prisma.flock.findUnique({ where: { id } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  if (!isValidTransition(flock.status as FlockStatus, input.status)) {
    throw validation(`Tidak dapat mengubah status dari ${flock.status} ke ${input.status}`);
  }
  const eff = completionEffects(input.status);
  const cullDate = input.actualCullDate ? toDate(input.actualCullDate) : new Date();

  return prisma.$transaction(async (tx) => {
    const f = await tx.flock.update({
      where: { id }, data: { status: input.status, actualCullDate: cullDate },
    });
    if (eff.closeAssignment) {
      const open = await tx.houseAssignment.findFirst({ where: { houseId: flock.houseId, flockId: id, endDate: null } });
      if (open) await tx.houseAssignment.update({ where: { id: open.id }, data: { endDate: cullDate } });
    }
    await tx.house.update({ where: { id: flock.houseId }, data: { status: eff.nextHouseStatus } });
    await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "UPDATE",
      oldValues: { status: flock.status }, newValues: { status: input.status }, reason: input.reason, ipAddress: ip }, tx);
    return f;
  });
}

export async function updateFlock(id: bigint, input: UpdateFlockInput, principal: AuthPrincipal, ip?: string | null) {
  const flock = await prisma.flock.findUnique({ where: { id } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  requireFarmAccess(principal, flock.farmId.toString());

  const data: Prisma.FlockUpdateInput = {};
  if (input.code) data.code = input.code;
  if (input.strainId) data.strain = { connect: { id: input.strainId } };
  if (input.sourceSupplier !== undefined) data.sourceSupplier = input.sourceSupplier;
  if (input.hatchDate) data.hatchDate = toDate(input.hatchDate);
  if (input.entryDate) data.entryDate = toDate(input.entryDate);
  if (input.initialPopulation !== undefined) data.initialPopulation = input.initialPopulation;
  if (input.productionPhase) data.productionPhase = input.productionPhase;
  if (input.rearingType) data.rearingType = input.rearingType;
  if (input.targetProductionNote !== undefined) data.targetProductionNote = input.targetProductionNote;
  if (input.plannedCullDate) data.plannedCullDate = toDate(input.plannedCullDate);
  if (input.notes !== undefined) data.notes = input.notes;

  const updated = await prisma.flock.update({ where: { id }, data });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "Flock", entityId: id, action: "UPDATE",
    oldValues: { code: flock.code }, newValues: input, ipAddress: ip });
  return updated;
}
