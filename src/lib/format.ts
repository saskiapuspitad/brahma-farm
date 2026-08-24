/** Format tampilan angka Indonesia. Nilai null → "—" (belum dapat dihitung). */
export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("id-ID");
}

export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return `${fmtNum(v, decimals)}%`;
}

export function fmtCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
}
