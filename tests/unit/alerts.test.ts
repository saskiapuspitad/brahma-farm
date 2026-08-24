import { describe, it, expect } from "vitest";
import { evaluateAlerts, DEFAULT_THRESHOLDS, type EvaluationContext } from "@/domain/alerts/rules";

const base: EvaluationContext = {
  hdpPct: 92,
  hdpTarget: 92.5,
  fcr: 1.95,
  fcrTarget: 1.95,
  mortalityPct: 0.02,
  feedIntakeG: 112,
  feedIntakeMovingAvgG: 112,
  avgEggWeightG: 62,
  avgEggWeightPrevG: 62,
  abnormalEggPct: 0.5,
  populationConsistent: true,
  withdrawalActive: false,
};

describe("Peringatan dini rule-based", () => {
  it("kondisi normal → tidak ada peringatan", () => {
    expect(evaluateAlerts(base)).toEqual([]);
  });

  it("HDP turun 8 poin → CRITICAL", () => {
    const a = evaluateAlerts({ ...base, hdpPct: 84.5, hdpTarget: 92.5 });
    const hdp = a.find((x) => x.type === "HDP_DROP");
    expect(hdp?.severity).toBe("CRITICAL");
  });

  it("HDP turun 4 poin → WARNING", () => {
    const a = evaluateAlerts({ ...base, hdpPct: 88.5, hdpTarget: 92.5 });
    expect(a.find((x) => x.type === "HDP_DROP")?.severity).toBe("WARNING");
  });

  it("FCR jauh di atas target → CRITICAL", () => {
    const a = evaluateAlerts({ ...base, fcr: 2.3, fcrTarget: 1.95 });
    expect(a.find((x) => x.type === "FCR_HIGH")?.severity).toBe("CRITICAL");
  });

  it("mortalitas harian tinggi → CRITICAL", () => {
    const a = evaluateAlerts({ ...base, mortalityPct: 0.4 });
    expect(a.find((x) => x.type === "MORTALITY_HIGH")?.severity).toBe("CRITICAL");
  });

  it("konsumsi pakan menyimpang 20% → FEED_ABNORMAL", () => {
    const a = evaluateAlerts({ ...base, feedIntakeG: 90, feedIntakeMovingAvgG: 112 });
    expect(a.some((x) => x.type === "FEED_ABNORMAL")).toBe(true);
  });

  it("populasi tidak konsisten → CRITICAL", () => {
    const a = evaluateAlerts({ ...base, populationConsistent: false });
    expect(a.find((x) => x.type === "POPULATION_INCONSISTENT")?.severity).toBe("CRITICAL");
  });

  it("withdrawal aktif → INFO", () => {
    const a = evaluateAlerts({ ...base, withdrawalActive: true, withdrawalUntil: "2026-09-01" });
    expect(a.find((x) => x.type === "WITHDRAWAL_ACTIVE")?.severity).toBe("INFO");
  });

  it("ambang dapat diatur (override)", () => {
    const strict = { ...DEFAULT_THRESHOLDS, mortalityDailyWarningPct: 0.01 };
    const a = evaluateAlerts({ ...base, mortalityPct: 0.02 }, strict);
    expect(a.some((x) => x.type === "MORTALITY_HIGH")).toBe(true);
  });
});
