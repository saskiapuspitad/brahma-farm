/**
 * Perhitungan umur ayam dari tanggal menetas ke tanggal recording.
 * Fungsi murni; bekerja pada tanggal kalender (abaikan jam/menit & zona waktu
 * karena record_date & hatch_date adalah DATE lokal WIB).
 */

export interface Age {
  days: number;
  weeks: number; // floor(days / 7)
  dayOfWeek: number; // sisa hari (days % 7)
  label: string; // contoh: "25 minggu 3 hari"
}

/** Normalisasi ke tengah hari UTC agar selisih hari stabil dari perbedaan DST/zona. */
function toDateOnly(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Hitung umur (hari) antara hatchDate dan recordDate.
 * @throws Error bila recordDate < hatchDate.
 */
export function ageInDays(hatchDate: Date, recordDate: Date): number {
  const ms = toDateOnly(recordDate) - toDateOnly(hatchDate);
  const days = Math.round(ms / 86_400_000);
  if (days < 0) {
    throw new Error("Tanggal recording tidak boleh lebih awal dari tanggal menetas");
  }
  return days;
}

export function computeAge(hatchDate: Date, recordDate: Date): Age {
  const days = ageInDays(hatchDate, recordDate);
  const weeks = Math.floor(days / 7);
  const dayOfWeek = days % 7;
  return {
    days,
    weeks,
    dayOfWeek,
    label: `${weeks} minggu ${dayOfWeek} hari`,
  };
}
