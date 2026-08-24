import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";

/** GET /api/imports/history — riwayat aktivitas impor. */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "VIEW_REPORTS");
    const history = await prisma.importHistory.findMany({
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(serialize(history));
  } catch (err) {
    return handleError(err);
  }
}
