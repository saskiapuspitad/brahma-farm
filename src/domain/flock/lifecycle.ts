/**
 * Aturan siklus hidup flock — LAPISAN DOMAIN MURNI (tanpa DB), dapat diuji.
 * Menjaga histori: penempatan flock di kandang dicatat sebagai assignment;
 * satu kandang hanya boleh punya satu flock aktif pada satu waktu.
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

/**
 * Validasi aktivasi flock ke kandang.
 * @param hasActiveFlockInHouse apakah kandang sudah punya flock aktif lain.
 */
export function validateActivation(params: {
  currentStatus: FlockStatus;
  hasActiveFlockInHouse: boolean;
  hatchDate: Date;
  entryDate: Date;
  initialPopulation: number;
}): TransitionError[] {
  const errors: TransitionError[] = [];
  if (!isValidTransition(params.currentStatus, "ACTIVE")) {
    errors.push({ field: "status", message: `Tidak dapat mengaktifkan flock dari status ${params.currentStatus}` });
  }
  if (params.hasActiveFlockInHouse) {
    errors.push({ field: "houseId", message: "Kandang sudah memiliki flock aktif. Selesaikan/afkir flock lama dulu." });
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
 * Efek penutupan flock (COMPLETED/CULLED): assignment ditutup, kandang jadi
 * SANITATION (default setelah panen) atau EMPTY. Data recording TIDAK dihapus.
 */
export function completionEffects(to: "COMPLETED" | "CULLED"): {
  closeAssignment: true;
  nextHouseStatus: HouseStatus;
} {
  return {
    closeAssignment: true,
    nextHouseStatus: "SANITATION",
    // catatan: after sanitation selesai, house di-set EMPTY via aksi terpisah.
    ...(to === "CULLED" ? {} : {}),
  };
}

/** Umur saat masuk (hari) — untuk mengisi entry_age_days. */
export function entryAgeDays(hatchDate: Date, entryDate: Date): number {
  const ms = Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate())
    - Date.UTC(hatchDate.getUTCFullYear(), hatchDate.getUTCMonth(), hatchDate.getUTCDate());
  return Math.max(0, Math.round(ms / 86_400_000));
}
