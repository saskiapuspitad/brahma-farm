import { ok, handleError } from "@/lib/api";
import { requirePrincipal } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    return ok({ id: p.userId, fullName: p.fullName, email: p.email, roles: p.roles, farmIds: p.farmIds });
  } catch (err) {
    return handleError(err);
  }
}
