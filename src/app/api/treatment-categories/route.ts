import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";

/** GET /api/treatment-categories — master kategori perlakuan. */
export async function GET(req: Request) {
  try {
    await requirePrincipal(req);
    const cats = await prisma.treatmentCategory.findMany({ orderBy: { name: "asc" } });
    return ok(serialize(cats));
  } catch (err) {
    return handleError(err);
  }
}
