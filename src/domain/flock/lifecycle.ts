/**
 * Aturan siklus hidup flock — LAPISAN DOMAIN MURNI (tanpa DB), dapat diuji.
 * Menjaga histori: penempatan flock di kandang dicatat sebagai assignment.
 * Satu kandang boleh berisi BEBERAPA flock aktif sekaligus (beda umur, mis. A1 & A2),
 * tetapi satu flock hanya menempati satu kandang pada satu waktu.
 */

export type FlockStatus = "PREPARATION" | "ACTIVE" | "COMPLETED" | "CULLED";
export type HouseStatus = "EMPTY" | "ACTIVE" | "SANITATION" | "INACTIVE";

export interface TransitionError {
  field: string;
  message: string;
}

/** Transisi status flock yang diizinkan. */
const ALLOWED_TRANSITIONS: Record<FlockStatus, FlockStatus[]> = {
  PREPARATION: ["ACTIVE", "CULLED"],
  ACTIVE: ["COMPLETED", "CULLED"],
  COMPLETED: [], // final
  CULLED: [], // final
};

export function isValidTransition(from: FlockStatus, to: FlockStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Validasi aktivasi flock ke kandang (kandang boleh sudah berisi flock aktif lain). */
export function validateActivation(params: {
  currentStatus: FlockStatus;
  hatchDate: Date;
  entryDate: Date;
  initialPopulation: number;
}): TransitionError[] {
  const errors: TransitionError[] = [];
  if (!isValidTransition(params.currentStatus, "ACTIVE")) {
    errors.push({ field: "status", message: `Tidak dapat mengaktifkan flock dari status ${params.currentStatus}` });
  }
  if (params.entryDate < params.hatchDate) {
    errors.push({ field: "entryDate", message: "Tanggal masuk tidak boleh lebih awal dari tanggal menetas" });
  }
  if (!Number.isInteger(params.initialPopulation) || params.initialPopulation < 0) {
    errors.push({ field: "initialPopulation", message: "Populasi awal harus bilangan bulat non-negatif" });
  }
  return errors;
}

/**
 * Efek penutupan flock (COMPLETED/CULLED): assignment ditutup. Kandang baru
 * jadi SANITATION bila tidak ada lagi flock aktif lain di dalamnya; bila masih
 * ada (mis. A2 masih produksi saat A1 diafkir), kandang tetap ACTIVE.
 * Data recording TIDAK dihapus.
 */
export function completionEffects(
  _to: "COMPLETED" | "CULLED",
  otherActiveFlocksInHouse = 0,
): {
  closeAssignment: true;
  nextHouseStatus: HouseStatus;
} {
  return {
    closeAssignment: true,
    // Setelah sanitasi selesai, kandang di-set EMPTY via aksi terpisah.
    nextHouseStatus: otherActiveFlocksInHouse > 0 ? "ACTIVE" : "SANITATION",
  };
}

/**
 * Saran kode flock berikutnya untuk sebuah kandang, mengikuti pola kode yang
 * sudah ada (A1, A2 → A3; B-01 → B-02). Bila kandang belum punya flock,
 * pakai kode kandang sebagai awalan (A → A1, K-03 → K-03-1).
 */
export function suggestFlockCode(houseCode: string, existingCodesInHouse: string[], allCodesInFarm: string[] = []): string {
  const taken = new Set([...existingCodesInHouse, ...allCodesInFarm].map((c) => c.toUpperCase()));
  const counts = new Map<string, { max: number; width: number; n: number }>();
  for (const code of existingCodesInHouse) {
    const m = /^(.*?)(\d+)$/.exec(code.trim());
    if (!m) continue;
    const [, prefix, num] = m;
    const cur = counts.get(prefix) ?? { max: 0, width: 0, n: 0 };
    cur.max = Math.max(cur.max, Number(num));
    cur.width = Math.max(cur.width, num.length);
    cur.n += 1;
    counts.set(prefix, cur);
  }
  let prefix: string;
  let next: number;
  let width: number;
  if (counts.size > 0) {
    const [bestPrefix, info] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].max - a[1].max)[0];
    prefix = bestPrefix; next = info.max + 1; width = info.width;
  } else {
    const base = houseCode.trim();
    prefix = /\d$/.test(base) ? `${base}-` : base;
    next = 1; width = 1;
  }
  let code = `${prefix}${String(next).padStart(width, "0")}`;
  while (taken.has(code.toUpperCase())) { next += 1; code = `${prefix}${String(next).padStart(width, "0")}`; }
  return code;
}

/** Umur saat masuk (hari) — untuk mengisi entry_age_days. */
export function entryAgeDays(hatchDate: Date, entryDate: Date): number {
  const ms = Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate())
    - Date.UTC(hatchDate.getUTCFullYear(), hatchDate.getUTCMonth(), hatchDate.getUTCDate());
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Status flock yang dianggap "nonaktif" (siklus sudah ditutup). */
export const INACTIVE_FLOCK_STATUSES: FlockStatus[] = ["COMPLETED", "CULLED"];

export function isInactiveFlock(status: FlockStatus): boolean {
  return INACTIVE_FLOCK_STATUSES.includes(status);
}

/**
 * Validasi pengaktifan kembali flock yang sudah dinonaktifkan (COMPLETED/CULLED → ACTIVE).
 * Dipakai untuk mengoreksi penonaktifan yang keliru; histori tetap utuh.
 */
export function validateReopen(params: {
  currentStatus: FlockStatus;
  houseUsable: boolean;
}): TransitionError[] {
  const errors: TransitionError[] = [];
  if (!isInactiveFlock(params.currentStatus)) {
    errors.push({ field: "status", message: "Hanya flock berstatus Selesai/Afkir yang dapat diaktifkan kembali" });
  }
  if (!params.houseUsable) {
    errors.push({ field: "houseId", message: "Kandang flock ini sudah dihapus/nonaktif" });
  }
  return errors;
}

/**
 * Flock boleh dihapus permanen dari daftar (soft delete) hanya bila belum
 * punya data produksi; flock yang sudah berjalan cukup dinonaktifkan.
 */
export function validateDelete(params: { recordCount: number; treatmentCount: number }): TransitionError[] {
  const errors: TransitionError[] = [];
  if (params.recordCount > 0) {
    errors.push({ field: "records", message: `Flock sudah memiliki ${params.recordCount} recording. Gunakan Nonaktifkan agar data tetap tersimpan.` });
  }
  if (params.treatmentCount > 0) {
    errors.push({ field: "treatments", message: `Flock sudah memiliki ${params.treatmentCount} catatan perlakuan. Gunakan Nonaktifkan agar data tetap tersimpan.` });
  }
  return errors;
}
