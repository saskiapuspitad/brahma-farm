import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { updateFlockSchema, deleteFlockSchema } from "@/lib/zod/flock";
import { getFlockDetail, updateFlock, deleteFlock } from "@/services/flock.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    const { id } = await params;
    return ok(serialize(await getFlockDetail(BigInt(id), p)));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_FLOCKS");
    const { id } = await params;
    const input = updateFlockSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await updateFlock(BigInt(id), input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/flocks/:id — hapus flock tanpa recording/perlakuan (khusus admin). Body: { reason }. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_FLOCKS");
    const { id } = await params;
    const input = deleteFlockSchema.parse(await req.json().catch(() => ({})));
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await deleteFlock(BigInt(id), input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
