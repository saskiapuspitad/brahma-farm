import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { getPrefill } from "@/services/recording.service";
import { validation } from "@/lib/errors";

/** GET /api/recordings/prefill?houseId=&date=YYYY-MM-DD */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const houseId = url.searchParams.get("houseId");
    const date = url.searchParams.get("date");
    if (!houseId || !date) throw validation("Parameter houseId dan date wajib diisi");
    const data = await getPrefill(BigInt(houseId), date, p);
    return ok(serialize(data));
  } catch (err) {
    return handleError(err);
  }
}
