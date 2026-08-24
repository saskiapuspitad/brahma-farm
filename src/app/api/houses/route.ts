import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { createHouseSchema } from "@/lib/zod/house";
import { listHouses, createHouse } from "@/services/house.service";

/** GET /api/houses?farmId=&status= */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const data = await listHouses(p, {
      farmId: url.searchParams.get("farmId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return ok(serialize(data));
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/houses */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_HOUSES");
    const input = createHouseSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const house = await createHouse(input, p, ip);
    return created(serialize(house));
  } catch (err) {
    return handleError(err);
  }
}
