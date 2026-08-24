import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { listAlerts } from "@/services/alert.service";

export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const data = await listAlerts(p, {
      farmId: url.searchParams.get("farmId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      severity: url.searchParams.get("severity") ?? undefined,
    });
    return ok(serialize(data));
  } catch (err) {
    return handleError(err);
  }
}
