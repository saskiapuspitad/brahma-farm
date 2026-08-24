import { prisma } from "@/lib/db";
import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { Prisma } from "@prisma/client";
import { z } from "zod";

/** GET /api/standards?strainId= */
export async function GET(req: Request) {
  try {
    await requirePrincipal(req);
    const url = new URL(req.url);
    const strainId = url.searchParams.get("strainId");
    const standards = await prisma.performanceStandard.findMany({
      where: strainId ? { strainId: BigInt(strainId) } : {},
      include: { strain: { select: { name: true, code: true } } },
      orderBy: [{ strainId: "asc" }, { ageWeek: "asc" }],
    });
    return ok(serialize(standards));
  } catch (err) {
    return handleError(err);
  }
}

const num = z.number().nullable().optional();
const createSchema = z.object({
  strainId: z.coerce.bigint(),
  ageWeek: z.number().int().min(0),
  hdpTarget: num, feedIntakeTargetG: num, eggWeightTargetG: num, eggMassTargetG: num,
  fcrTarget: num, bodyWeightTargetG: num, maxMortalityPct: num,
  sourceLabel: z.string().min(1, "Sumber standar wajib diisi (mis. manual breeder)"),
});

const D = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(n));

/** POST /api/standards — upsert satu baris standar (Super Admin). */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_STANDARDS");
    const input = createSchema.parse(await req.json());
    const std = await prisma.performanceStandard.upsert({
      where: { strainId_ageWeek: { strainId: input.strainId, ageWeek: input.ageWeek } },
      create: {
        strainId: input.strainId, ageWeek: input.ageWeek, hdpTarget: D(input.hdpTarget),
        feedIntakeTargetG: D(input.feedIntakeTargetG), eggWeightTargetG: D(input.eggWeightTargetG),
        eggMassTargetG: D(input.eggMassTargetG), fcrTarget: D(input.fcrTarget),
        bodyWeightTargetG: D(input.bodyWeightTargetG), maxMortalityPct: D(input.maxMortalityPct),
        sourceLabel: input.sourceLabel,
      },
      update: {
        hdpTarget: D(input.hdpTarget), feedIntakeTargetG: D(input.feedIntakeTargetG),
        eggWeightTargetG: D(input.eggWeightTargetG), eggMassTargetG: D(input.eggMassTargetG),
        fcrTarget: D(input.fcrTarget), bodyWeightTargetG: D(input.bodyWeightTargetG),
        maxMortalityPct: D(input.maxMortalityPct), sourceLabel: input.sourceLabel,
      },
    });
    return created(serialize(std));
  } catch (err) {
    return handleError(err);
  }
}
