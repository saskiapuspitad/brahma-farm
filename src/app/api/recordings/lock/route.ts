import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { lockPeriod, unlockPeriod } from "@/services/recording-correction.service";
import { z } from "zod";

const schema = z.object({
  flockId: z.coerce.bigint(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.enum(["lock", "unlock"]).default("lock"),
});

/** POST /api/recordings/lock — kunci/buka periode (unlock hanya Super Admin). */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "VERIFY_RECORDING");
    const { flockId, from, to, action } = schema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const fromD = new Date(`${from}T00:00:00Z`);
    const toD = new Date(`${to}T00:00:00Z`);
    const res = action === "lock"
      ? await lockPeriod(flockId, fromD, toD, p, ip)
      : await unlockPeriod(flockId, fromD, toD, p, ip);
    return ok(serialize(res));
  } catch (err) {
    return handleError(err);
  }
}
