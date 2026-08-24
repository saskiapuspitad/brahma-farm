import { describe, it, expect } from "vitest";
import {
  computeDailyIndicators,
  livePopulation,
  hdp,
  hhp,
  eggMassPerHen,
  feedIntakePerHen,
  fcr,
  avgEggWeight,
  dailyMortality,
  cumulativeMortality,
  depletion,
  henHousedEggs,
  cumulativeEggMass,
  aggregatePeriod,
} from "@/domain/indicators/formulas";
import { roundDisplay } from "@/domain/indicators/rounding";

/**
 * Kasus acuan (DESIGN.md §5.7):
 * populasi awal 1000, mati 2, afkir 1, total telur 850, berat 51 kg, pakan 110 kg.
 * Basis default = OPENING → populasi hidup = 1000. HHP hari pertama → initial = 1000.
 */
describe("Contoh kasus perhitungan (basis OPENING)", () => {
  const ind = computeDailyIndicators({
    openingPopulation: 1000,
    closingPopulation: 997,
    initialPopulation: 1000,
    mortality: 2,
    totalEggs: 850,
    crackedEggs: 20,
    dirtyEggs: 20,
    totalWeightKg: 51,
    feedConsumedKg: 110,
    pricePerKg: 7500,
    basis: "OPENING",
  });

  it("populasi hidup = populasi awal (OPENING)", () => {
    expect(ind.livePopulation).toBe(1000);
  });
  it("HDP = 85,00%", () => {
    expect(roundDisplay(ind.hdpPct, 2)).toBe(85.0);
  });
  it("HHP = 85,00%", () => {
    expect(roundDisplay(ind.hhpPct, 2)).toBe(85.0);
  });
  it("egg mass/ekor = 51,00 g", () => {
    expect(roundDisplay(ind.eggMassG, 2)).toBe(51.0);
  });
  it("konsumsi pakan/ekor = 110,00 g", () => {
    expect(roundDisplay(ind.feedIntakeG, 2)).toBe(110.0);
  });
  it("FCR = 2,16", () => {
    expect(roundDisplay(ind.fcr, 2)).toBe(2.16);
  });
  it("berat telur rata-rata = 60,00 g", () => {
    expect(roundDisplay(ind.avgEggWeightG, 2)).toBe(60.0);
  });
  it("mortalitas harian = 0,20%", () => {
    expect(roundDisplay(ind.mortalityPct, 2)).toBe(0.2);
  });
  it("biaya pakan = 110 × 7500 = 825.000", () => {
    expect(ind.feedCost).toBe(825000);
  });
});

describe("Basis populasi alternatif", () => {
  it("AVERAGE → HDP 85,13%", () => {
    const live = livePopulation(1000, 997, "AVERAGE"); // 998,5
    expect(live).toBe(998.5);
    expect(roundDisplay(hdp(850, live), 2)).toBe(85.13);
  });
  it("CLOSING → HDP 85,26%", () => {
    const live = livePopulation(1000, 997, "CLOSING"); // 997
    expect(roundDisplay(hdp(850, live), 2)).toBe(85.26);
  });
});

describe("Penanganan nilai nol / kosong (tidak boleh error)", () => {
  it("FCR null bila massa telur 0", () => {
    expect(fcr(110, 0)).toBeNull();
  });
  it("HDP null bila populasi hidup 0", () => {
    expect(hdp(850, 0)).toBeNull();
  });
  it("berat telur rata-rata null bila total telur 0", () => {
    expect(avgEggWeight(51, 0)).toBeNull();
  });
  it("mortalitas null bila populasi awal 0", () => {
    expect(dailyMortality(2, 0)).toBeNull();
  });
  it("HHP null bila populasi awal flock 0", () => {
    expect(hhp(850, 0)).toBeNull();
  });
});

describe("Indikator kumulatif", () => {
  it("mortalitas kumulatif = 1,50%", () => {
    expect(roundDisplay(cumulativeMortality(15, 1000), 2)).toBe(1.5);
  });
  it("deplesi = 2,00% (15 mati + 5 afkir / 1000)", () => {
    expect(roundDisplay(depletion(15, 5, 1000), 2)).toBe(2.0);
  });
  it("hen-housed eggs = 180 butir/ekor", () => {
    expect(roundDisplay(henHousedEggs(180000, 1000), 2)).toBe(180.0);
  });
  it("egg mass kumulatif = 10800 g/ekor", () => {
    expect(roundDisplay(cumulativeEggMass(10800, 1000), 2)).toBe(10800.0);
  });
});

describe("Agregasi periode (berbasis hen-days, bukan rata-rata persen harian)", () => {
  const rows = [
    { livePopulation: 1000, openingPopulation: 1000, mortality: 2, culling: 1, totalEggs: 850, crackedEggs: 20, dirtyEggs: 20, totalWeightKg: 51, feedConsumedKg: 110, feedCost: 825000 },
    { livePopulation: 997, openingPopulation: 997, mortality: 1, culling: 0, totalEggs: 900, crackedEggs: 10, dirtyEggs: 15, totalWeightKg: 55, feedConsumedKg: 112, feedCost: 840000 },
  ];
  const agg = aggregatePeriod(rows);

  it("total telur = 1750", () => expect(agg.totalEggs).toBe(1750));
  it("total berat = 106 kg", () => expect(agg.totalWeightKg).toBe(106));
  it("HDP periode = 1750 / (1000+997) × 100 = 87,63%", () => {
    expect(roundDisplay(agg.hdpPct, 2)).toBe(87.63);
  });
  it("FCR periode = 222 / 106 = 2,09", () => {
    expect(roundDisplay(agg.fcr, 2)).toBe(2.09);
  });
  it("mortalitas periode pakai populasi awal periode (1000): 3/1000 = 0,30%", () => {
    expect(roundDisplay(agg.mortalityPct, 2)).toBe(0.3);
  });
  it("biaya pakan periode dijumlahkan = 1.665.000", () => {
    expect(agg.feedCost).toBe(1665000);
  });
  it("rata-rata populasi = (1000+997)/2 = 998,5", () => {
    expect(agg.avgPopulation).toBe(998.5);
  });
});
