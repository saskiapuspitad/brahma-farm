/**
 * Mutasi & propagasi populasi. Fungsi murni.
 * closing = opening - mortality - culling + transferIn - transferOut
 */

export interface PopulationMutation {
  openingPopulation: number;
  mortality: number;
  culling: number;
  transferIn: number;
  transferOut: number;
}

export interface PopulationValidationError {
  field: string;
  message: string;
}

/** Hitung populasi akhir dari mutasi. */
export function closingPopulation(m: PopulationMutation): number {
  return (
    m.openingPopulation - m.mortality - m.culling + m.transferIn - m.transferOut
  );
}

/**
 * Validasi mutasi populasi. Mengembalikan daftar error (kosong bila valid).
 * Aturan:
 *  - semua nilai bilangan bulat non-negatif
 *  - mortality + culling <= opening + transferIn
 *  - closing tidak boleh negatif
 */
export function validatePopulation(m: PopulationMutation): PopulationValidationError[] {
  const errors: PopulationValidationError[] = [];
  const fields: (keyof PopulationMutation)[] = [
    "openingPopulation",
    "mortality",
    "culling",
    "transferIn",
    "transferOut",
  ];
  for (const f of fields) {
    const v = m[f];
    if (!Number.isInteger(v)) errors.push({ field: f, message: "Harus bilangan bulat" });
    if (v < 0) errors.push({ field: f, message: "Tidak boleh negatif" });
  }
  if (errors.length > 0) return errors;

  const removed = m.mortality + m.culling;
  const available = m.openingPopulation + m.transferIn;
  if (removed > available) {
    errors.push({
      field: "mortality",
      message: `Mortalitas + afkir (${removed}) melebihi populasi tersedia (${available})`,
    });
  }
  if (closingPopulation(m) < 0) {
    errors.push({ field: "transferOut", message: "Populasi akhir tidak boleh negatif" });
  }
  return errors;
}

/** Populasi awal hari berikutnya = populasi akhir hari ini. */
export function nextOpeningFromClosing(closing: number): number {
  return closing;
}
