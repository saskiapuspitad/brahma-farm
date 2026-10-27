import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { reopenFlockSchema } from "@/lib/zod/flock";
import { reopenFlock } from "@/services/flock.service";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/flocks/:id/reopen — aktifkan kembali flock Selesai/Afkir (khusus admin). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_FLOCKS");
    const { id } = await params;
    const input = reopenFlockSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await reopenFlock(BigInt(id), input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
