import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess } from "@/lib/rbac";
import { notFound, validation } from "@/lib/errors";
import { writeAudit } from "./audit.service";
import type { CreateTreatmentInput, UpdateTreatmentInput } from "@/lib/zod/treatment";

const toDate = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

/** withdrawal_until = (end_date | start_date) + withdrawal_days. */
function computeWithdrawalUntil(start: Date, end: Date | null, days?: number): Date | null {
  if (!days || days <= 0) return null;
  const base = end ?? start;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function scopeWhere(principal: AuthPrincipal, farmId?: string): Prisma.TreatmentWhereInput {
  const where: Prisma.TreatmentWhereInput = { deletedAt: null };
  if (farmId) where.farmId = BigInt(farmId);
  if (!principal.roles.includes("SUPER_ADMIN")) {
    where.farmId = farmId ? BigInt(farmId) : { in: principal.farmIds.filter(Boolean).map((f) => BigInt(f!)) };
  }
  return where;
}

export async function listTreatments(principal: AuthPrincipal, opts: { farmId?: string; flockId?: string; categoryId?: string }) {
  const where = scopeWhere(principal, opts.farmId);
  if (opts.flockId) where.flockId = BigInt(opts.flockId);
  if (opts.categoryId) where.categoryId = BigInt(opts.categoryId);
  return prisma.treatment.findMany({
    where,
    include: {
      category: { select: { name: true, code: true } },
      flock: { select: { code: true } },
      house: { select: { code: true } },
      responsibleUser: { select: { fullName: true } },
    },
    orderBy: { startDate: "desc" },
  });
}

export async function getTreatment(id: bigint, principal: AuthPrincipal) {
  const t = await prisma.treatment.findUnique({
    where: { id },
    include: { category: true, product: true, flock: { select: { code: true } }, house: { select: { code: true } } },
  });
  if (!t || t.deletedAt) throw notFound("Perlakuan tidak ditemukan");
  requireFarmAccess(principal, t.farmId.toString());
  return t;
}

export async function createTreatment(input: CreateTreatmentInput, principal: AuthPrincipal, ip?: string | null) {
  requireFarmAccess(principal, input.farmId.toString());
  const flock = await prisma.flock.findUnique({ where: { id: input.flockId } });
  if (!flock || flock.deletedAt) throw notFound("Flock tidak ditemukan");
  if (flock.houseId !== input.houseId || flock.farmId !== input.farmId) {
    throw validation("Kombinasi peternakan/kandang/flock tidak konsisten");
  }
  const start = toDate(input.startDate)!;
  const end = toDate(input.endDate);
  if (end && end < start) throw validation("Tanggal selesai tidak boleh sebelum tanggal mulai", [{ field: "endDate", message: "≥ tanggal mulai" }]);
  const withdrawalUntil = computeWithdrawalUntil(start, end, input.withdrawalDays);

  const t = await prisma.treatment.create({
    data: {
      farmId: input.farmId, houseId: input.houseId, flockId: input.flockId,
      categoryId: input.categoryId, productId: input.productId ?? null,
      name: input.name, purpose: input.purpose,
      dose: input.dose != null ? new Prisma.Decimal(input.dose) : null,
      doseUnit: input.doseUnit, route: input.route, durationDays: input.durationDays,
      startDate: start, endDate: end, withdrawalDays: input.withdrawalDays, withdrawalUntil,
      responsibleUserId: input.responsibleUserId ?? BigInt(principal.userId),
      cost: input.cost != null ? new Prisma.Decimal(input.cost) : null,
      observationNote: input.observationNote, status: input.status,
    },
  });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "Treatment", entityId: t.id, action: "CREATE",
    newValues: { name: input.name, category: input.categoryId.toString() }, ipAddress: ip });
  return t;
}

export async function updateTreatment(id: bigint, input: UpdateTreatmentInput, principal: AuthPrincipal, ip?: string | null) {
  const t = await prisma.treatment.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw notFound("Perlakuan tidak ditemukan");
  requireFarmAccess(principal, t.farmId.toString());

  const start = input.startDate ? toDate(input.startDate)! : t.startDate;
  const end = input.endDate !== undefined ? toDate(input.endDate) : t.endDate;
  const days = input.withdrawalDays !== undefined ? input.withdrawalDays : (t.withdrawalDays ?? undefined);
  const withdrawalUntil = computeWithdrawalUntil(start, end, days ?? undefined);

  const data: Prisma.TreatmentUpdateInput = {
    startDate: start, endDate: end, withdrawalDays: days ?? null, withdrawalUntil,
  };
  if (input.name) data.name = input.name;
  if (input.purpose !== undefined) data.purpose = input.purpose;
  if (input.dose !== undefined) data.dose = input.dose != null ? new Prisma.Decimal(input.dose) : null;
  if (input.doseUnit !== undefined) data.doseUnit = input.doseUnit;
  if (input.route !== undefined) data.route = input.route;
  if (input.durationDays !== undefined) data.durationDays = input.durationDays;
  if (input.cost !== undefined) data.cost = input.cost != null ? new Prisma.Decimal(input.cost) : null;
  if (input.observationNote !== undefined) data.observationNote = input.observationNote;
  if (input.status) data.status = input.status;

  const updated = await prisma.treatment.update({ where: { id }, data });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "Treatment", entityId: id, action: "UPDATE",
    oldValues: { name: t.name }, newValues: input, ipAddress: ip });
  return updated;
}

export async function deleteTreatment(id: bigint, principal: AuthPrincipal, ip?: string | null) {
  const t = await prisma.treatment.findUnique({ where: { id } });
  if (!t || t.deletedAt) throw notFound("Perlakuan tidak ditemukan");
  requireFarmAccess(principal, t.farmId.toString());
  const updated = await prisma.treatment.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "Treatment", entityId: id, action: "DELETE", ipAddress: ip });
  return updated;
}
