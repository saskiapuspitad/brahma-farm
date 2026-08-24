import { prisma } from "@/lib/db";
import { DEFAULT_POPULATION_BASIS, type PopulationBasis } from "@/domain/indicators/formulas";
import { DEFAULT_THRESHOLDS, type AlertThresholds } from "@/domain/alerts/rules";

/**
 * Setelan sistem (configurable). Prioritas: setting per-farm → global → default kode.
 */

export async function getPopulationBasis(farmId?: bigint): Promise<PopulationBasis> {
  const value = await getSetting<string>("hdp_population_basis", farmId);
  if (value === "OPENING" || value === "AVERAGE" || value === "CLOSING") return value;
  return DEFAULT_POPULATION_BASIS;
}

export async function getThresholds(farmId?: bigint): Promise<AlertThresholds> {
  const value = await getSetting<Partial<AlertThresholds>>("alert_thresholds", farmId);
  return { ...DEFAULT_THRESHOLDS, ...(value ?? {}) };
}

export async function getHdpTermLabel(farmId?: bigint): Promise<string> {
  return (await getSetting<string>("hdp_term_label", farmId)) ?? "HDP (Hen-Day Production)";
}

/** Ambil nilai setting; cek per-farm dulu, lalu global (farmId null). */
export async function getSetting<T>(key: string, farmId?: bigint): Promise<T | null> {
  if (farmId != null) {
    const perFarm = await prisma.systemSetting.findUnique({
      where: { farmId_key: { farmId, key } },
    });
    if (perFarm) return perFarm.value as T;
  }
  const global = await prisma.systemSetting.findFirst({ where: { farmId: null, key } });
  return global ? (global.value as T) : null;
}
