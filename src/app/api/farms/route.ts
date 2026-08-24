import { prisma } from "@/lib/db";
import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { createFarmSchema } from "@/lib/zod/house";

/** GET /api/farms — daftar peternakan (dibatasi cakupan bila bukan super admin). */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const where: Record<string, unknown> = { deletedAt: null };
    if (!p.roles.includes("SUPER_ADMIN")) {
      where.id = { in: p.farmIds.filter(Boolean).map((f) => BigInt(f!)) };
    }
    const farms = await prisma.farm.findMany({ where, orderBy: { code: "asc" } });
    return ok(serialize(farms));
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/farms — hanya Super Admin. */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_FARMS");
    const input = createFarmSchema.parse(await req.json());
    const farm = await prisma.farm.create({ data: input });
    return created(serialize(farm));
  } catch (err) {
    return handleError(err);
  }
}
