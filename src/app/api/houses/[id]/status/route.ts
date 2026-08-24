import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { setHouseStatusSchema } from "@/lib/zod/house";
import { setHouseStatus } from "@/services/house.service";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/houses/:id/status */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_HOUSES");
    const { id } = await params;
    const { status } = setHouseStatusSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await setHouseStatus(BigInt(id), status, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
