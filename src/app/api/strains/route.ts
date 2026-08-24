import { prisma } from "@/lib/db";
import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { z } from "zod";

/** GET /api/strains — master galur ayam. */
export async function GET(req: Request) {
  try {
    await requirePrincipal(req);
    const strains = await prisma.strain.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
    return ok(serialize(strains));
  } catch (err) {
    return handleError(err);
  }
}

const createStrainSchema = z.object({
  code: z.string().min(1), name: z.string().min(1), breeder: z.string().optional(), description: z.string().optional(),
});

/** POST /api/strains — Super Admin (master data). */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_SETTINGS");
    const input = createStrainSchema.parse(await req.json());
    const strain = await prisma.strain.create({ data: input });
    return created(serialize(strain));
  } catch (err) {
    return handleError(err);
  }
}
