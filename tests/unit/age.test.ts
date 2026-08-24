import { describe, it, expect } from "vitest";
import { computeAge, ageInDays } from "@/domain/indicators/age";

describe("Umur ayam", () => {
  it("178 hari = 25 minggu 3 hari", () => {
    const hatch = new Date(Date.UTC(2026, 1, 26)); // 26 Feb 2026
    const rec = new Date(Date.UTC(2026, 7, 23)); // 23 Agu 2026
    const age = computeAge(hatch, rec);
    expect(age.days).toBe(178);
    expect(age.weeks).toBe(25);
    expect(age.dayOfWeek).toBe(3);
    expect(age.label).toBe("25 minggu 3 hari");
  });

  it("hari yang sama = 0 hari", () => {
    const d = new Date(Date.UTC(2026, 0, 1));
    expect(ageInDays(d, d)).toBe(0);
  });

  it("tepat 7 hari = 1 minggu 0 hari", () => {
    const hatch = new Date(Date.UTC(2026, 0, 1));
    const rec = new Date(Date.UTC(2026, 0, 8));
    const age = computeAge(hatch, rec);
    expect(age.label).toBe("1 minggu 0 hari");
  });

  it("menolak recording sebelum menetas", () => {
    const hatch = new Date(Date.UTC(2026, 5, 1));
    const rec = new Date(Date.UTC(2026, 4, 1));
    expect(() => ageInDays(hatch, rec)).toThrow();
  });
});
