import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility, requireFarmAccess } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { correctRecordingSchema } from "@/lib/zod/recording";
import { correctRecording } from "@/services/recording-correction.service";
import { computeAge } from "@/domain/indicators/age";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/recordings/:id — detail lengkap + umur. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    const { id } = await params;
    const rec = await prisma.dailyRecord.findUnique({
      where: { id: BigInt(id) },
      include: {
        population: true, eggs: true, feed: true, water: true, environment: true,
        flock: { include: { strain: { select: { name: true } } } },
        house: { select: { code: true, name: true } },
        recordedByUser: { select: { fullName: true } },
      },
    });
    if (!rec || rec.deletedAt) throw notFound("Recording tidak ditemukan");
    requireFarmAccess(p, rec.farmId.toString());
    const age = computeAge(rec.flock.hatchDate, rec.recordDate);
    return ok(serialize({ ...rec, age }));
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /api/recordings/:id — koreksi (wajib alasan). */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "CORRECT_RECORDING");
    const { id } = await params;
    const input = correctRecordingSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await correctRecording(BigInt(id), input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
