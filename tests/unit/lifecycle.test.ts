import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  validateActivation,
  completionEffects,
  entryAgeDays,
  validateReopen,
  validateDelete,
  suggestFlockCode,
} from "@/domain/flock/lifecycle";

describe("Transisi status flock", () => {
  it("PREPARATION → ACTIVE diizinkan", () => {
    expect(isValidTransition("PREPARATION", "ACTIVE")).toBe(true);
  });
  it("ACTIVE → COMPLETED diizinkan", () => {
    expect(isValidTransition("ACTIVE", "COMPLETED")).toBe(true);
  });
  it("ACTIVE → CULLED diizinkan", () => {
    expect(isValidTransition("ACTIVE", "CULLED")).toBe(true);
  });
  it("COMPLETED tidak bisa berubah lagi", () => {
    expect(isValidTransition("COMPLETED", "ACTIVE")).toBe(false);
  });
  it("PREPARATION → COMPLETED tidak diizinkan (harus lewat ACTIVE)", () => {
    expect(isValidTransition("PREPARATION", "COMPLETED")).toBe(false);
  });
});

describe("Validasi aktivasi flock", () => {
  const base = {
    currentStatus: "PREPARATION" as const,
    hatchDate: new Date(Date.UTC(2026, 1, 26)),
    entryDate: new Date(Date.UTC(2026, 4, 20)),
    initialPopulation: 1000,
  };

  it("kondisi valid → tanpa error", () => {
    expect(validateActivation(base)).toEqual([]);
  });
  it("kandang boleh berisi beberapa flock aktif (tidak ada cek kandang)", () => {
    expect(validateActivation(base)).toEqual([]);
  });
  it("menolak tanggal masuk sebelum menetas", () => {
    const errs = validateActivation({ ...base, entryDate: new Date(Date.UTC(2026, 0, 1)) });
    expect(errs.some((e) => e.field === "entryDate")).toBe(true);
  });
  it("menolak populasi awal negatif", () => {
    const errs = validateActivation({ ...base, initialPopulation: -5 });
    expect(errs.some((e) => e.field === "initialPopulation")).toBe(true);
  });
  it("menolak aktivasi dari status COMPLETED", () => {
    const errs = validateActivation({ ...base, currentStatus: "COMPLETED" });
    expect(errs.some((e) => e.field === "status")).toBe(true);
  });
});

describe("Efek penutupan & umur masuk", () => {
  it("penutupan flock terakhir → kandang SANITATION", () => {
    const eff = completionEffects("COMPLETED");
    expect(eff.closeAssignment).toBe(true);
    expect(eff.nextHouseStatus).toBe("SANITATION");
  });
  it("penutupan saat masih ada flock aktif lain → kandang tetap ACTIVE", () => {
    expect(completionEffects("CULLED", 1).nextHouseStatus).toBe("ACTIVE");
  });
  it("umur saat masuk dihitung benar (26 Feb → 20 Mei 2026 = 83 hari)", () => {
    expect(entryAgeDays(new Date(Date.UTC(2026, 1, 26)), new Date(Date.UTC(2026, 4, 20)))).toBe(83);
  });
});

describe("Aktifkan kembali & hapus flock", () => {
  it("COMPLETED/CULLED boleh diaktifkan kembali bila kandang kosong", () => {
    expect(validateReopen({ currentStatus: "COMPLETED", houseUsable: true })).toEqual([]);
    expect(validateReopen({ currentStatus: "CULLED", houseUsable: true })).toEqual([]);
  });
  it("menolak aktifkan kembali flock yang masih ACTIVE/PREPARATION", () => {
    expect(validateReopen({ currentStatus: "ACTIVE", houseUsable: true }).length).toBeGreaterThan(0);
    expect(validateReopen({ currentStatus: "PREPARATION", houseUsable: true }).length).toBeGreaterThan(0);
  });
  it("menolak aktifkan kembali bila kandang sudah dihapus/nonaktif", () => {
    const errs = validateReopen({ currentStatus: "COMPLETED", houseUsable: false });
    expect(errs.some((e) => e.field === "houseId")).toBe(true);
  });
  it("hapus hanya untuk flock tanpa recording & perlakuan", () => {
    expect(validateDelete({ recordCount: 0, treatmentCount: 0 })).toEqual([]);
    expect(validateDelete({ recordCount: 3, treatmentCount: 0 }).some((e) => e.field === "records")).toBe(true);
    expect(validateDelete({ recordCount: 0, treatmentCount: 1 }).some((e) => e.field === "treatments")).toBe(true);
  });
});

describe("Saran kode flock per kandang", () => {
  it("melanjutkan pola yang ada: A1, A2 → A3", () => {
    expect(suggestFlockCode("A", ["A1", "A2"])).toBe("A3");
  });
  it("kandang kosong berkode huruf: A → A1", () => {
    expect(suggestFlockCode("A", [])).toBe("A1");
  });
  it("kandang kosong berkode angka: K-03 → K-03-1", () => {
    expect(suggestFlockCode("K-03", [])).toBe("K-03-1");
  });
  it("menjaga lebar angka: B-01 → B-02", () => {
    expect(suggestFlockCode("B", ["B-01"])).toBe("B-02");
  });
  it("melewati kode yang sudah dipakai di peternakan", () => {
    expect(suggestFlockCode("A", ["A1", "A2"], ["A3"])).toBe("A4");
  });
});
