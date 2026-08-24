import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  validateActivation,
  completionEffects,
  entryAgeDays,
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
    hasActiveFlockInHouse: false,
    hatchDate: new Date(Date.UTC(2026, 1, 26)),
    entryDate: new Date(Date.UTC(2026, 4, 20)),
    initialPopulation: 1000,
  };

  it("kondisi valid → tanpa error", () => {
    expect(validateActivation(base)).toEqual([]);
  });
  it("menolak bila kandang sudah ada flock aktif", () => {
    const errs = validateActivation({ ...base, hasActiveFlockInHouse: true });
    expect(errs.some((e) => e.field === "houseId")).toBe(true);
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
  it("penutupan menutup assignment & set kandang SANITATION", () => {
    const eff = completionEffects("COMPLETED");
    expect(eff.closeAssignment).toBe(true);
    expect(eff.nextHouseStatus).toBe("SANITATION");
  });
  it("umur saat masuk dihitung benar (26 Feb → 20 Mei 2026 = 83 hari)", () => {
    expect(entryAgeDays(new Date(Date.UTC(2026, 1, 26)), new Date(Date.UTC(2026, 4, 20)))).toBe(83);
  });
});
