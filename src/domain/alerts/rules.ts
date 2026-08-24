/**
 * Peringatan dini berbasis aturan (rule-based thresholds). Fungsi murni.
 * Didesain agar tahap lanjut dapat menambah anomaly detection (ML) tanpa
 * mengubah pemicu di service. Setiap aturan menghasilkan AlertCandidate | null.
 */

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type AlertType =
  | "HDP_DROP"
  | "FCR_HIGH"
  | "FEED_ABNORMAL"
  | "WATER_ABNORMAL"
  | "MORTALITY_HIGH"
  | "EGG_WEIGHT_DROP"
  | "ABNORMAL_EGG_HIGH"
  | "MISSING_RECORD"
  | "POPULATION_INCONSISTENT"
  | "TREATMENT_OVERDUE"
  | "WITHDRAWAL_ACTIVE";

export interface AlertCandidate {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  context: Record<string, unknown>;
}

/** Ambang peringatan (dapat diatur admin via system_settings.alert_thresholds). */
export interface AlertThresholds {
  hdpDropPointsWarning: number; // selisih poin HDP di bawah target
  hdpDropPointsCritical: number;
  fcrHighWarning: number; // selisih FCR di atas target
  fcrHighCritical: number;
  mortalityDailyWarningPct: number;
  mortalityDailyCriticalPct: number;
  feedDeviationPct: number; // deviasi konsumsi pakan vs rata-rata bergerak
  eggWeightDropPct: number;
  abnormalEggPctWarning: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  hdpDropPointsWarning: 3,
  hdpDropPointsCritical: 7,
  fcrHighWarning: 0.1,
  fcrHighCritical: 0.3,
  mortalityDailyWarningPct: 0.1,
  mortalityDailyCriticalPct: 0.3,
  feedDeviationPct: 15,
  eggWeightDropPct: 5,
  abnormalEggPctWarning: 3,
};

export interface EvaluationContext {
  hdpPct: number | null;
  hdpTarget: number | null;
  fcr: number | null;
  fcrTarget: number | null;
  mortalityPct: number | null;
  feedIntakeG: number | null;
  feedIntakeMovingAvgG: number | null;
  avgEggWeightG: number | null;
  avgEggWeightPrevG: number | null;
  abnormalEggPct: number | null;
  populationConsistent: boolean;
  withdrawalActive: boolean;
  withdrawalUntil?: string | null;
}

/** Jalankan seluruh aturan; kembalikan daftar peringatan yang menyala. */
export function evaluateAlerts(
  ctx: EvaluationContext,
  t: AlertThresholds = DEFAULT_THRESHOLDS
): AlertCandidate[] {
  const out: AlertCandidate[] = [];

  // HDP turun di bawah target
  if (ctx.hdpPct != null && ctx.hdpTarget != null) {
    const drop = ctx.hdpTarget - ctx.hdpPct;
    if (drop >= t.hdpDropPointsCritical) {
      out.push({
        type: "HDP_DROP",
        severity: "CRITICAL",
        message: `HDP ${fmt(ctx.hdpPct)}% turun ${fmt(drop)} poin di bawah target ${fmt(ctx.hdpTarget)}%`,
        context: { hdp: ctx.hdpPct, target: ctx.hdpTarget, drop },
      });
    } else if (drop >= t.hdpDropPointsWarning) {
      out.push({
        type: "HDP_DROP",
        severity: "WARNING",
        message: `HDP ${fmt(ctx.hdpPct)}% di bawah target ${fmt(ctx.hdpTarget)}%`,
        context: { hdp: ctx.hdpPct, target: ctx.hdpTarget, drop },
      });
    }
  }

  // FCR naik di atas target
  if (ctx.fcr != null && ctx.fcrTarget != null) {
    const excess = ctx.fcr - ctx.fcrTarget;
    if (excess >= t.fcrHighCritical) {
      out.push(alert("FCR_HIGH", "CRITICAL", `FCR ${fmt(ctx.fcr)} jauh di atas target ${fmt(ctx.fcrTarget)}`, { fcr: ctx.fcr, target: ctx.fcrTarget, excess }));
    } else if (excess >= t.fcrHighWarning) {
      out.push(alert("FCR_HIGH", "WARNING", `FCR ${fmt(ctx.fcr)} di atas target ${fmt(ctx.fcrTarget)}`, { fcr: ctx.fcr, target: ctx.fcrTarget, excess }));
    }
  }

  // Mortalitas harian tinggi
  if (ctx.mortalityPct != null) {
    if (ctx.mortalityPct >= t.mortalityDailyCriticalPct) {
      out.push(alert("MORTALITY_HIGH", "CRITICAL", `Mortalitas harian ${fmt(ctx.mortalityPct)}% sangat tinggi`, { mortalityPct: ctx.mortalityPct }));
    } else if (ctx.mortalityPct >= t.mortalityDailyWarningPct) {
      out.push(alert("MORTALITY_HIGH", "WARNING", `Mortalitas harian ${fmt(ctx.mortalityPct)}% di atas normal`, { mortalityPct: ctx.mortalityPct }));
    }
  }

  // Konsumsi pakan abnormal (deviasi vs rata-rata bergerak)
  if (ctx.feedIntakeG != null && ctx.feedIntakeMovingAvgG != null && ctx.feedIntakeMovingAvgG > 0) {
    const devPct = Math.abs((ctx.feedIntakeG - ctx.feedIntakeMovingAvgG) / ctx.feedIntakeMovingAvgG) * 100;
    if (devPct >= t.feedDeviationPct) {
      out.push(alert("FEED_ABNORMAL", "WARNING", `Konsumsi pakan ${fmt(ctx.feedIntakeG)} g menyimpang ${fmt(devPct)}% dari rata-rata`, { feedIntakeG: ctx.feedIntakeG, movingAvg: ctx.feedIntakeMovingAvgG, devPct }));
    }
  }

  // Berat telur menurun
  if (ctx.avgEggWeightG != null && ctx.avgEggWeightPrevG != null && ctx.avgEggWeightPrevG > 0) {
    const dropPct = ((ctx.avgEggWeightPrevG - ctx.avgEggWeightG) / ctx.avgEggWeightPrevG) * 100;
    if (dropPct >= t.eggWeightDropPct) {
      out.push(alert("EGG_WEIGHT_DROP", "WARNING", `Berat telur rata-rata turun ${fmt(dropPct)}%`, { current: ctx.avgEggWeightG, prev: ctx.avgEggWeightPrevG, dropPct }));
    }
  }

  // Telur abnormal tinggi
  if (ctx.abnormalEggPct != null && ctx.abnormalEggPct >= t.abnormalEggPctWarning) {
    out.push(alert("ABNORMAL_EGG_HIGH", "WARNING", `Telur abnormal ${fmt(ctx.abnormalEggPct)}% di atas ambang`, { abnormalEggPct: ctx.abnormalEggPct }));
  }

  // Populasi tidak konsisten
  if (!ctx.populationConsistent) {
    out.push(alert("POPULATION_INCONSISTENT", "CRITICAL", "Populasi tidak konsisten dengan mutasi", {}));
  }

  // Withdrawal period aktif
  if (ctx.withdrawalActive) {
    out.push(alert("WITHDRAWAL_ACTIVE", "INFO", `Masih dalam masa henti obat${ctx.withdrawalUntil ? ` s.d. ${ctx.withdrawalUntil}` : ""}`, { withdrawalUntil: ctx.withdrawalUntil ?? null }));
  }

  return out;
}

function alert(type: AlertType, severity: AlertSeverity, message: string, context: Record<string, unknown>): AlertCandidate {
  return { type, severity, message, context };
}

function fmt(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toString().replace(".", ",");
}
