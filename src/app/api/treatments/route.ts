import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { createTreatmentSchema } from "@/lib/zod/treatment";
import { listTreatments, createTreatment } from "@/services/treatment.service";

export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    const url = new URL(req.url);
    const data = await listTreatments(p, {
      farmId: url.searchParams.get("farmId") ?? undefined,
      flockId: url.searchParams.get("flockId") ?? undefined,
      categoryId: url.searchParams.get("categoryId") ?? undefined,
    });
    return ok(serialize(data));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_TREATMENTS");
    const input = createTreatmentSchema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return created(serialize(await createTreatment(input, p, ip)));
  } catch (err) {
    return handleError(err);
  }
}
