import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { getPrefill } from "@/services/recording.service";
import { validation } from "@/lib/errors";

/**
 * GET /api/recordings/prefill?flockId=&date=YYYY-MM-DD
 * (houseId= masih diterima bila kandang hanya berisi satu flock aktif.)
 */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const flockId = url.searchParams.get("flockId");
    const houseId = url.searchParams.get("houseId");
    const date = url.searchParams.get("date");
    if ((!flockId && !houseId) || !date) throw validation("Parameter flockId dan date wajib diisi");
    const data = await getPrefill(
      { flockId: flockId ? BigInt(flockId) : undefined, houseId: houseId ? BigInt(houseId) : undefined },
      date, p,
    );
    return ok(serialize(data));
  } catch (err) {
    return handleError(err);
  }
}
