import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { updateHouseSchema } from "@/lib/zod/house";
import { getHouseDetail, updateHouse, softDeleteHouse } from "@/services/house.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    const { id } = await params;
    return ok(serialize(await getHouseDetail(BigInt(id), p)));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_HOUSES");
    const { id } = await params;
    const input = updateHouseSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await updateHouse(BigInt(id), input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_HOUSES");
    const { id } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return ok(serialize(await softDeleteHouse(BigInt(id), p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
