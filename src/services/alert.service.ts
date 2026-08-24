import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { requireFarmAccess } from "@/lib/rbac";
import { notFound } from "@/lib/errors";

function scopeWhere(principal: AuthPrincipal, farmId?: string): Prisma.AlertWhereInput {
  const where: Prisma.AlertWhereInput = {};
  if (farmId) where.farmId = BigInt(farmId);
  if (!principal.roles.includes("SUPER_ADMIN")) {
    where.farmId = farmId ? BigInt(farmId) : { in: principal.farmIds.filter(Boolean).map((f) => BigInt(f!)) };
  }
  return where;
}

export async function listAlerts(principal: AuthPrincipal, opts: { farmId?: string; status?: string; severity?: string }) {
  const where = scopeWhere(principal, opts.farmId);
  if (opts.status) where.status = opts.status as Prisma.AlertWhereInput["status"];
  if (opts.severity) where.severity = opts.severity as Prisma.AlertWhereInput["severity"];
  return prisma.alert.findMany({
    where,
    include: { house: { select: { code: true } }, flock: { select: { code: true } } },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
}

export async function followUpAlert(
  id: bigint,
  input: { actionNote?: string; newStatus?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"; treatmentId?: bigint },
  principal: AuthPrincipal
) {
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) throw notFound("Peringatan tidak ditemukan");
  requireFarmAccess(principal, alert.farmId.toString());

  return prisma.$transaction(async (tx) => {
    await tx.alertFollowUp.create({
      data: {
        alertId: id, userId: BigInt(principal.userId),
        actionNote: input.actionNote, newStatus: input.newStatus ?? null, treatmentId: input.treatmentId ?? null,
      },
    });
    if (input.newStatus) {
      await tx.alert.update({ where: { id }, data: { status: input.newStatus } });
    }
    return tx.alert.findUniqueOrThrow({ where: { id }, include: { followUps: true } });
  });
}
