import { describe, it, expect } from "vitest";
import {
  closingPopulation,
  validatePopulation,
  nextOpeningFromClosing,
} from "@/domain/indicators/population";

describe("Mutasi populasi", () => {
  it("closing = opening - mati - afkir + masuk - keluar", () => {
    expect(
      closingPopulation({ openingPopulation: 1000, mortality: 2, culling: 1, transferIn: 0, transferOut: 0 })
    ).toBe(997);
  });
  it("memperhitungkan transfer", () => {
    expect(
      closingPopulation({ openingPopulation: 1000, mortality: 5, culling: 3, transferIn: 50, transferOut: 20 })
    ).toBe(1022);
  });
  it("propagasi: populasi awal besok = populasi akhir hari ini", () => {
    expect(nextOpeningFromClosing(997)).toBe(997);
  });
});

describe("Validasi populasi", () => {
  it("valid → tanpa error", () => {
    expect(
      validatePopulation({ openingPopulation: 1000, mortality: 2, culling: 1, transferIn: 0, transferOut: 0 })
    ).toEqual([]);
  });
  it("menolak nilai negatif", () => {
    const errs = validatePopulation({ openingPopulation: 1000, mortality: -1, culling: 0, transferIn: 0, transferOut: 0 });
    expect(errs.some((e) => e.field === "mortality")).toBe(true);
  });
  it("menolak mortalitas+afkir melebihi populasi tersedia", () => {
    const errs = validatePopulation({ openingPopulation: 1000, mortality: 1200, culling: 0, transferIn: 0, transferOut: 0 });
    expect(errs.some((e) => e.message.includes("melebihi"))).toBe(true);
  });
  it("menolak populasi akhir negatif", () => {
    const errs = validatePopulation({ openingPopulation: 100, mortality: 0, culling: 0, transferIn: 0, transferOut: 200 });
    expect(errs.length).toBeGreaterThan(0);
  });
  it("menolak nilai non-integer", () => {
    const errs = validatePopulation({ openingPopulation: 1000.5, mortality: 0, culling: 0, transferIn: 0, transferOut: 0 });
    expect(errs.some((e) => e.field === "openingPopulation")).toBe(true);
  });
});
