import { prisma } from "@/lib/db";
import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { createRecordingSchema } from "@/lib/zod/recording";
import { createRecording } from "@/services/recording.service";

/** GET /api/recordings — daftar recording (filter: farmId, houseId, flockId, from, to). */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const farmId = url.searchParams.get("farmId");
    const houseId = url.searchParams.get("houseId");
    const flockId = url.searchParams.get("flockId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") ?? 30));

    const where: Record<string, unknown> = { deletedAt: null };
    if (farmId) where.farmId = BigInt(farmId);
    if (houseId) where.houseId = BigInt(houseId);
    if (flockId) where.flockId = BigInt(flockId);
    if (from || to) {
      where.recordDate = {
        ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
      };
    }
    // Cakupan: non-super-admin dibatasi ke farm-nya.
    if (!p.roles.includes("SUPER_ADMIN")) {
      const allowed = p.farmIds.filter(Boolean).map((f) => BigInt(f!));
      where.farmId = farmId ? BigInt(farmId) : { in: allowed };
    }

    const [total, rows] = await Promise.all([
      prisma.dailyRecord.count({ where }),
      prisma.dailyRecord.findMany({
        where,
        include: { population: true, eggs: true, feed: true, flock: { select: { code: true } }, house: { select: { code: true, name: true } } },
        orderBy: [{ recordDate: "desc" }, { houseId: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok(serialize(rows), { page, pageSize, total });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/recordings — buat recording harian. */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "CREATE_RECORDING");
    const body = await req.json();
    const input = createRecordingSchema.parse(body);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const result = await createRecording(input, p, ip);
    return created(serialize(result));
  } catch (err) {
    return handleError(err);
  }
}
