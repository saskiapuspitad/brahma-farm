"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./client";

export interface Me {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  farmIds: (string | null)[];
}

/** Peran yang boleh mengelola flock — sama dengan ABILITIES.MANAGE_FLOCKS di server. */
const FLOCK_ADMIN_ROLES = ["SUPER_ADMIN", "FARM_ADMIN"];

/** Ambil pengguna yang sedang login. Hanya untuk menyembunyikan tombol; izin tetap ditegakkan di API. */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    apiGet<Me>("/api/auth/me").then((r) => { if (r.ok) setMe(r.data!); });
  }, []);
  const canManageFlocks = !!me?.roles.some((r) => FLOCK_ADMIN_ROLES.includes(r));
  return { me, canManageFlocks };
}
