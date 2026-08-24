import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { updateTreatmentSchema } from "@/lib/zod/treatment";
import { getTreatment, updateTreatment, deleteTreatment } from "@/services/treatment.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    const { id } = await params;
    return ok(serialize(await getTreatment(BigInt(id), p)));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_TREATMENTS");
    const { id } = await params;
    const input = updateTreatmentSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await updateTreatment(BigInt(id), input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_TREATMENTS");
    const { id } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await deleteTreatment(BigInt(id), p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
