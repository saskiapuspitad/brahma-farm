import { ok, handleError } from "@/lib/api";
import { requirePrincipal } from "@/lib/auth";
import { validation } from "@/lib/errors";
import { suggestCodeForHouse } from "@/services/flock.service";

/** GET /api/flocks/suggest-code?houseId= — saran kode flock berikutnya di kandang (A1, A2 → A3). */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const houseId = new URL(req.url).searchParams.get("houseId");
    if (!houseId) throw validation("Parameter houseId wajib diisi");
    return ok(await suggestCodeForHouse(BigInt(houseId), p));
  } catch (err) {
    return handleError(err);
  }
}
