import type { AuthPrincipal, RoleCode } from "./auth";
import { forbidden } from "./errors";

/**
 * RBAC sederhana berbasis peran + cakupan farm.
 * Peran menentukan aksi; farmIds menentukan data mana yang terlihat.
 */

export function hasRole(p: AuthPrincipal, ...roles: RoleCode[]): boolean {
  return p.roles.some((r) => roles.includes(r));
}

export function isSuperAdmin(p: AuthPrincipal): boolean {
  return p.roles.includes("SUPER_ADMIN");
}

/** Lempar FORBIDDEN bila principal tidak punya salah satu peran. */
export function requireRole(p: AuthPrincipal, ...roles: RoleCode[]): void {
  if (!hasRole(p, ...roles)) throw forbidden();
}

/** Super admin melihat semua farm; lainnya dibatasi farmIds pada token. */
export function canAccessFarm(p: AuthPrincipal, farmId: string): boolean {
  if (isSuperAdmin(p)) return true;
  return p.farmIds.includes(farmId);
}

export function requireFarmAccess(p: AuthPrincipal, farmId: string): void {
  if (!canAccessFarm(p, farmId)) throw forbidden("Di luar cakupan peternakan Anda");
}

/** Definisi kemampuan (untuk referensi & UI). */
export const ABILITIES = {
  MANAGE_USERS: ["SUPER_ADMIN"],
  MANAGE_FARMS: ["SUPER_ADMIN"],
  MANAGE_HOUSES: ["SUPER_ADMIN", "FARM_ADMIN"],
  MANAGE_FLOCKS: ["SUPER_ADMIN", "FARM_ADMIN"],
  CREATE_RECORDING: ["SUPER_ADMIN", "FARM_ADMIN", "HOUSE_OPERATOR"],
  CORRECT_RECORDING: ["SUPER_ADMIN", "FARM_ADMIN"],
  VERIFY_RECORDING: ["SUPER_ADMIN", "FARM_ADMIN"],
  UNLOCK_RECORDING: ["SUPER_ADMIN"],
  MANAGE_TREATMENTS: ["SUPER_ADMIN", "FARM_ADMIN"],
  MANAGE_STANDARDS: ["SUPER_ADMIN"],
  MANAGE_SETTINGS: ["SUPER_ADMIN"],
  VIEW_REPORTS: ["SUPER_ADMIN", "FARM_ADMIN"],
} as const satisfies Record<string, RoleCode[]>;

export function can(p: AuthPrincipal, ability: keyof typeof ABILITIES): boolean {
  return hasRole(p, ...ABILITIES[ability]);
}

export function requireAbility(p: AuthPrincipal, ability: keyof typeof ABILITIES): void {
  if (!can(p, ability)) throw forbidden();
}
