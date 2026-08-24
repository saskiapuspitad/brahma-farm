import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { createFlockSchema } from "@/lib/zod/flock";
import { listFlocks, createFlock } from "@/services/flock.service";

/** GET /api/flocks?farmId=&houseId=&status= */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const data = await listFlocks(p, {
      farmId: url.searchParams.get("farmId") ?? undefined,
      houseId: url.searchParams.get("houseId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return ok(serialize(data));
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/flocks */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_FLOCKS");
    const input = createFlockSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return created(serialize(await createFlock(input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
