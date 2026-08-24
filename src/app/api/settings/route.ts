import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { z } from "zod";

/** GET /api/settings — daftar setelan global. */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_SETTINGS");
    const settings = await prisma.systemSetting.findMany({ where: { farmId: null }, orderBy: { key: "asc" } });
    return ok(serialize(settings));
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
});

/** PATCH /api/settings — upsert satu setelan global (Super Admin). */
export async function PATCH(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_SETTINGS");
    const { key, value, description } = patchSchema.parse(await req.json());
    const existing = await prisma.systemSetting.findFirst({ where: { farmId: null, key } });
    const saved = existing
      ? await prisma.systemSetting.update({ where: { id: existing.id }, data: { value: value as never, description, updatedBy: BigInt(p.userId) } })
      : await prisma.systemSetting.create({ data: { key, value: value as never, description, updatedBy: BigInt(p.userId) } });
    return ok(serialize(saved));
  } catch (err) {
    return handleError(err);
  }
}
