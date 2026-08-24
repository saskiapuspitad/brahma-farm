import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";
import { loginSchema } from "@/lib/zod/auth";
import {
  verifyPassword, buildPrincipal, signAccessToken, signRefreshToken,
  ACCESS_COOKIE, REFRESH_COOKIE, accessMaxAge, refreshMaxAge,
} from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    rateLimit(clientKey(req, "login"), 5, 60_000);
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || !user.isActive) {
      return fail("UNAUTHENTICATED", "Email atau kata sandi salah", 401);
    }
    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) return fail("UNAUTHENTICATED", "Email atau kata sandi salah", 401);

    const principal = await buildPrincipal(user.id);
    const accessToken = await signAccessToken(principal);
    const refreshToken = await signRefreshToken(principal.userId);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const store = await cookies();
    const secure = process.env.NODE_ENV === "production";
    store.set(ACCESS_COOKIE, accessToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: accessMaxAge });
    store.set(REFRESH_COOKIE, refreshToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: refreshMaxAge });

    return ok({
      accessToken,
      user: { id: principal.userId, fullName: principal.fullName, email: principal.email, roles: principal.roles },
    });
  } catch (err) {
    return handleError(err);
  }
}
