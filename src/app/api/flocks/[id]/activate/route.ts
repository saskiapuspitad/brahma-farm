import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { activateFlock } from "@/services/flock.service";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/flocks/:id/activate */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_FLOCKS");
    const { id } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await activateFlock(BigInt(id), p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
