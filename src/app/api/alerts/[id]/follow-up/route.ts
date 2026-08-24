import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { followUpAlert } from "@/services/alert.service";
import { z } from "zod";

const schema = z.object({
  actionNote: z.string().max(1000).optional(),
  newStatus: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  treatmentId: z.coerce.bigint().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/alerts/:id/follow-up */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_TREATMENTS");
    const { id } = await params;
    const input = schema.parse(await req.json());
    return ok(serialize(await followUpAlert(BigInt(id), input, p)));
  } catch (err) {
    return handleError(err);
  }
}
