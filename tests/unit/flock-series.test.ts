import { describe, it, expect } from "vitest";
import { buildFlockSeries, type RawDay } from "@/domain/reports/flock-series";

function day(date: string, ageWeek: number, p: Partial<RawDay> = {}): RawDay {
  return {
    date, ageDays: ageWeek * 7, ageWeek,
    opening: 1000, closing: 1000, mortality: 0, culling: 0,
    wholeEggs: 900, crackedEggs: 0, brokenEggs: 0, dirtyEggs: 0, abnormalEggs: 0, totalEggs: 900,
    eggWeightKg: 54, feedKg: 110, feedCost: null, waterL: null, tempAvg: null, humidityPct: null,
    ...p,
  };
}

const base = { initialPopulation: 1000, basis: "OPENING" as const };

describe("Seri grafik per flock", () => {
  it("harian: satu titik per tanggal, indikator dihitung benar", () => {
    const { points } = buildFlockSeries([day("2026-10-01", 30)], { ...base, grouping: "day" });
    expect(points.length).toBe(1);
    expect(points[0].label).toBe("01/10");
    expect(points[0].hdpPct).toBe(90);
    expect(points[0].feedIntakeG).toBe(110);
    expect(points[0].avgEggWeightG).toBe(60);
  });

  it("mingguan: HDP = Σ telur ÷ Σ hen-days, bukan rata-rata persen harian", () => {
    const rows = [
      day("2026-10-01", 30, { opening: 1000, totalEggs: 900 }),
      day("2026-10-02", 30, { opening: 500, closing: 500, totalEggs: 500 }),
    ];
    const { points } = buildFlockSeries(rows, { ...base, grouping: "week" });
    expect(points.length).toBe(1);
    expect(points[0].label).toBe("Mg 30");
    // (900 + 500) / (1000 + 500) × 100 = 93,33 — rata-rata harian (90 & 100) akan salah memberi 95.
    expect(Math.round(points[0].hdpPct! * 100) / 100).toBe(93.33);
    expect(points[0].days).toBe(2);
  });

  it("mortalitas kumulatif dihitung sejak awal siklus walau rentang dibatasi", () => {
    const rows = [
      day("2026-10-01", 30, { mortality: 5, closing: 995 }),
      day("2026-10-02", 30, { opening: 995, mortality: 3, culling: 2, closing: 990 }),
    ];
    const { points, summary } = buildFlockSeries(rows, { ...base, grouping: "day", from: "2026-10-02" });
    expect(points.length).toBe(1);
    expect(points[0].cumMortalityPct).toBe(0.8); // (5 + 3) / 1000
    expect(points[0].depletionPct).toBe(1); // (8 + 2) / 1000
    expect(summary.mortality).toBe(3); // hanya dalam rentang
    expect(summary.lastPopulation).toBe(990);
  });

  it("target standar dicocokkan dengan umur minggu", () => {
    const targets = new Map([[30, { hdpPct: 94, feedIntakeG: 112, eggWeightG: 61, eggMassG: 57, fcr: 1.95, maxCumMortalityPct: 1.2 }]]);
    const { points } = buildFlockSeries([day("2026-10-01", 30), day("2026-10-08", 31)], { ...base, grouping: "week" }, targets);
    expect(points[0].target?.hdpPct).toBe(94);
    expect(points[1].target).toBe(null);
  });

  it("biaya pakan per kg telur & air per ekor", () => {
    const { points } = buildFlockSeries(
      [day("2026-10-01", 30, { feedCost: 770_000, waterL: 220 })],
      { ...base, grouping: "day" },
    );
    expect(Math.round(points[0].feedCostPerKgEgg!)).toBe(14259); // 770.000 / 54 kg
    expect(points[0].waterPerHenMl).toBe(220);
  });

  it("tanpa data → seri kosong & ringkasan null", () => {
    const { points, summary } = buildFlockSeries([], { ...base, grouping: "day" });
    expect(points.length).toBe(0);
    expect(summary.hdpPct).toBe(null);
    expect(summary.lastPopulation).toBe(null);
  });
});
