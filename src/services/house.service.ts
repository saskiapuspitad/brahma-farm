import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess } from "@/lib/rbac";
import { conflict, notFound, validation } from "@/lib/errors";
import { writeAudit } from "./audit.service";
import type { CreateHouseInput, UpdateHouseInput } from "@/lib/zod/house";

type HouseStatus = "EMPTY" | "ACTIVE" | "SANITATION" | "INACTIVE";

function scopeWhere(principal: AuthPrincipal, farmId?: string) {
  const where: Prisma.HouseWhereInput = { deletedAt: null };
  if (farmId) where.farmId = BigInt(farmId);
  if (!principal.roles.includes("SUPER_ADMIN")) {
    where.farmId = farmId ? BigInt(farmId) : { in: principal.farmIds.filter(Boolean).map((f) => BigInt(f!)) };
  }
  return where;
}

export async function listHouses(principal: AuthPrincipal, opts: { farmId?: string; status?: string }) {
  const where = scopeWhere(principal, opts.farmId);
  if (opts.status) where.status = opts.status as HouseStatus;
  return prisma.house.findMany({
    where,
    include: {
      // Satu kandang bisa berisi beberapa flock aktif (mis. A1 & A2).
      flocks: { where: { status: "ACTIVE", deletedAt: null }, select: { id: true, code: true }, orderBy: { code: "asc" } },
      responsibleUser: { select: { fullName: true } },
    },
    orderBy: { code: "asc" },
  });
}

export async function getHouseDetail(id: bigint, principal: AuthPrincipal) {
  const house = await prisma.house.findUnique({
    where: { id },
    include: {
      flocks: { where: { deletedAt: null }, orderBy: { entryDate: "desc" }, include: { strain: { select: { name: true } } } },
      assignments: { orderBy: { startDate: "desc" }, include: { flock: { select: { code: true } } } },
      responsibleUser: { select: { fullName: true } },
    },
  });
  if (!house || house.deletedAt) throw notFound("Kandang tidak ditemukan");
  requireFarmAccess(principal, house.farmId.toString());
  return house;
}

export async function createHouse(input: CreateHouseInput, principal: AuthPrincipal, ip?: string | null) {
  requireFarmAccess(principal, input.farmId.toString());
  const dup = await prisma.house.findFirst({ where: { farmId: input.farmId, code: input.code, deletedAt: null } });
  if (dup) throw conflict("Kode kandang sudah dipakai di peternakan ini");
  const house = await prisma.house.create({ data: { ...input, status: "EMPTY" } });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "House", entityId: house.id, action: "CREATE",
    newValues: { code: input.code }, ipAddress: ip });
  return house;
}

export async function updateHouse(id: bigint, input: UpdateHouseInput, principal: AuthPrincipal, ip?: string | null) {
  const house = await prisma.house.findUnique({ where: { id } });
  if (!house || house.deletedAt) throw notFound("Kandang tidak ditemukan");
  requireFarmAccess(principal, house.farmId.toString());
  const updated = await prisma.house.update({ where: { id }, data: input });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "House", entityId: id, action: "UPDATE",
    oldValues: { code: house.code }, newValues: input, ipAddress: ip });
  return updated;
}

export async function setHouseStatus(id: bigint, status: HouseStatus, principal: AuthPrincipal, ip?: string | null) {
  const house = await prisma.house.findUnique({ where: { id } });
  if (!house || house.deletedAt) throw notFound("Kandang tidak ditemukan");
  requireFarmAccess(principal, house.farmId.toString());
  // Tidak boleh menonaktifkan kandang yang masih punya flock aktif.
  if ((status === "INACTIVE" || status === "EMPTY") ) {
    const active = await prisma.flock.findFirst({ where: { houseId: id, status: "ACTIVE", deletedAt: null } });
    if (active) throw validation("Kandang masih memiliki flock aktif; selesaikan flock dahulu");
  }
  const updated = await prisma.house.update({ where: { id }, data: { status } });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "House", entityId: id, action: "UPDATE",
    oldValues: { status: house.status }, newValues: { status }, ipAddress: ip });
  return updated;
}

export async function softDeleteHouse(id: bigint, principal: AuthPrincipal, ip?: string | null) {
  const house = await prisma.house.findUnique({ where: { id } });
  if (!house || house.deletedAt) throw notFound("Kandang tidak ditemukan");
  requireFarmAccess(principal, house.farmId.toString());
  const active = await prisma.flock.findFirst({ where: { houseId: id, status: "ACTIVE", deletedAt: null } });
  if (active) throw validation("Kandang masih memiliki flock aktif; tidak dapat dinonaktifkan");
  const updated = await prisma.house.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
  await writeAudit({ userId: BigInt(principal.userId), entityType: "House", entityId: id, action: "DELETE", ipAddress: ip });
  return updated;
}
