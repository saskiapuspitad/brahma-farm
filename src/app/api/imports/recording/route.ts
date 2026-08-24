import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { importCsvSchema } from "@/lib/zod/import";
import { importRecordings } from "@/services/import.service";

export const runtime = "nodejs";

/** POST /api/imports/recording — body { csv, commit? }. commit=false → pratinjau. */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "CORRECT_RECORDING"); // admin peternakan & super admin
    const { csv, commit } = importCsvSchema.parse(await req.json());
    const result = await importRecordings(csv, p, commit ?? false);
    return ok(serialize(result));
  } catch (err) {
    return handleError(err);
  }
}
