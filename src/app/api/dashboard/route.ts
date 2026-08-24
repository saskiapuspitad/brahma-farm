import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { getDashboard } from "@/services/dashboard.service";

/** GET /api/dashboard?farmId=&from=&to= */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const farmId = url.searchParams.get("farmId");
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const data = await getDashboard(p, { farmId: farmId ? BigInt(farmId) : undefined, from, to });
    return ok(serialize(data));
  } catch (err) {
    return handleError(err);
  }
}
