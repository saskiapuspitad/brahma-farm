import { prisma } from "@/lib/db";
import { ok, created, handleError } from "@/lib/api";
import { serialize } from "@/lib/serialize";
import { requirePrincipal, hashPassword } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { conflict } from "@/lib/errors";
import { z } from "zod";

/** GET /api/users — Super Admin. */
export async function GET(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_USERS");
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { userRoles: { include: { role: { select: { code: true, name: true } }, farm: { select: { code: true } } } } },
      orderBy: { fullName: "asc" },
    });
    const shaped = users.map((u) => ({
      id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      roles: u.userRoles.map((ur) => ({ code: ur.role.code, name: ur.role.name, farm: ur.farm?.code ?? null })),
    }));
    return ok(serialize(shaped));
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  password: z.string().min(8, "Kata sandi minimal 8 karakter"),
  phone: z.string().optional(),
  roleCode: z.enum(["SUPER_ADMIN", "FARM_ADMIN", "HOUSE_OPERATOR"]),
  farmId: z.coerce.bigint().optional(),
});

/** POST /api/users — buat pengguna + tetapkan peran (Super Admin). */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_USERS");
    const input = createSchema.parse(await req.json());

    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw conflict("Email sudah terdaftar");

    const role = await prisma.role.findUniqueOrThrow({ where: { code: input.roleCode } });
    const passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: input.email, fullName: input.fullName, phone: input.phone, passwordHash } });
      await tx.userRole.create({ data: { userId: u.id, roleId: role.id, farmId: input.farmId ?? null } });
      return u;
    });
    return created(serialize({ id: user.id, email: user.email, fullName: user.fullName }));
  } catch (err) {
    return handleError(err);
  }
}
