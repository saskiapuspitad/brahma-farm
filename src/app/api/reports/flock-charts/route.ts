import { ok, handleError } from "@/lib/api";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { validation } from "@/lib/errors";
import { getFlockChartData } from "@/services/flock-report.service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/reports/flock-charts?flockId=&group=day|week&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "VIEW_REPORTS");
    const url = new URL(req.url);
    const flockId = url.searchParams.get("flockId");
    if (!flockId || !/^\d+$/.test(flockId)) throw validation("Parameter flockId wajib diisi");
    const group = url.searchParams.get("group") === "day" ? "day" : "week";
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    if ((from && !DATE.test(from)) || (to && !DATE.test(to))) throw validation("Format tanggal harus YYYY-MM-DD");
    return ok(await getFlockChartData(BigInt(flockId), p, { grouping: group, from, to }));
  } catch (err) {
    return handleError(err);
  }
}
