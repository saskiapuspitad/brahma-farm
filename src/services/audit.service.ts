import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof prisma;

interface AuditInput {
  userId?: bigint | null;
  entityType: string;
  entityId: bigint;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOCK" | "UNLOCK" | "VERIFY";
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
}

/** Catat jejak audit (old/new/user/time/reason). Selalu dalam transaksi bila memungkinkan. */
export async function writeAudit(input: AuditInput, client: Client = prisma): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      oldValues: (input.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
      newValues: (input.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
