import { SignJWT, jwtVerify } from "jose";
import argon2 from "argon2";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { unauthenticated } from "./errors";

const enc = new TextEncoder();
const accessSecret = () => enc.encode(process.env.JWT_ACCESS_SECRET ?? "dev-access");
const refreshSecret = () => enc.encode(process.env.JWT_REFRESH_SECRET ?? "dev-refresh");
const ACCESS_TTL = Number(process.env.JWT_ACCESS_TTL ?? 900);
const REFRESH_TTL = Number(process.env.JWT_REFRESH_TTL ?? 1_209_600);

export type RoleCode = "SUPER_ADMIN" | "FARM_ADMIN" | "HOUSE_OPERATOR";

export interface AuthPrincipal {
  userId: string;
  email: string;
  fullName: string;
  roles: RoleCode[];
  farmIds: (string | null)[]; // cakupan farm dari user_roles
}

// ---------- Password ----------
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}
export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// ---------- Token ----------
export async function signAccessToken(p: AuthPrincipal): Promise<string> {
  return new SignJWT({ email: p.email, roles: p.roles, farmIds: p.farmIds, fullName: p.fullName })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .sign(accessSecret());
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL}s`)
    .sign(refreshSecret());
}

export async function verifyAccessToken(token: string): Promise<AuthPrincipal> {
  const { payload } = await jwtVerify(token, accessSecret());
  return {
    userId: String(payload.sub),
    email: String(payload.email),
    fullName: String(payload.fullName ?? ""),
    roles: (payload.roles as RoleCode[]) ?? [],
    farmIds: (payload.farmIds as (string | null)[]) ?? [],
  };
}

export async function verifyRefreshToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, refreshSecret());
  return String(payload.sub);
}

// ---------- Membaca principal dari request (cookie httpOnly / header Bearer) ----------
export async function getPrincipal(req?: Request): Promise<AuthPrincipal | null> {
  let token: string | undefined;
  const header = req?.headers.get("authorization");
  if (header?.startsWith("Bearer ")) token = header.slice(7);
  if (!token) {
    const store = await cookies();
    token = store.get("access_token")?.value;
  }
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

export async function requirePrincipal(req?: Request): Promise<AuthPrincipal> {
  const p = await getPrincipal(req);
  if (!p) throw unauthenticated();
  return p;
}

// ---------- Login: bangun principal dari DB ----------
export async function buildPrincipal(userId: bigint): Promise<AuthPrincipal> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  return {
    userId: user.id.toString(),
    email: user.email,
    fullName: user.fullName,
    roles: user.userRoles.map((ur) => ur.role.code as RoleCode),
    farmIds: user.userRoles.map((ur) => (ur.farmId ? ur.farmId.toString() : null)),
  };
}

export const REFRESH_COOKIE = "refresh_token";
export const ACCESS_COOKIE = "access_token";
export const accessMaxAge = ACCESS_TTL;
export const refreshMaxAge = REFRESH_TTL;
