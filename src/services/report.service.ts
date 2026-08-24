import { prisma } from "@/lib/db";
import type { AuthPrincipal } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export type ReportType = "daily" | "flock" | "treatments" | "mortality" | "incomplete";

interface Filters { farmId?: string; flockId?: string; houseId?: string; from?: string; to?: string }

const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));

function farmScope(principal: AuthPrincipal, farmId?: string) {
  if (principal.roles.includes("SUPER_ADMIN")) return farmId ? { farmId: BigInt(farmId) } : {};
  const ids = principal.farmIds.filter(Boolean).map((f) => BigInt(f!));
  return { farmId: farmId ? BigInt(farmId) : { in: ids } };
}

function dateRange(f: Filters) {
  if (!f.from && !f.to) return undefined;
  return {
    ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
    ...(f.to ? { lte: new Date(`${f.to}T00:00:00Z`) } : {}),
  };
}

/** Menghasilkan baris laporan (array objek datar) sesuai jenis. */
export async function buildReport(type: ReportType, principal: AuthPrincipal, f: Filters): Promise<Record<string, unknown>[]> {
  const scope = farmScope(principal, f.farmId);
  const range = dateRange(f);

  if (type === "daily") {
    const summaries = await prisma.productivitySummary.findMany({
      where: {
        periodType: "DAILY",
        ...(f.flockId ? { flockId: BigInt(f.flockId) } : {}),
        ...(f.houseId ? { houseId: BigInt(f.houseId) } : {}),
        ...(range ? { periodStart: range } : {}),
        flock: scope,
      },
      include: { flock: { select: { code: true } }, house: { select: { code: true } } },
      orderBy: [{ periodStart: "asc" }],
    });
    return summaries.map((s) => ({
      tanggal: s.periodStart.toISOString().slice(0, 10), kandang: s.house?.code, flock: s.flock?.code,
      umur_hari: s.ageDays, umur_minggu: s.ageWeek, populasi: num(s.avgPopulation),
      total_telur: s.totalEggs, berat_telur_kg: num(s.totalEggWeightKg),
      hdp_pct: num(s.hdpPct), hhp_pct: num(s.hhpPct), egg_mass_g: num(s.eggMassG),
      pakan_ekor_g: num(s.feedIntakeG), fcr: num(s.fcr), berat_telur_g: num(s.avgEggWeightG),
      mortalitas_pct: num(s.mortalityPct), retak_pct: num(s.crackedPct), kotor_pct: num(s.dirtyPct),
      pakan_kg: num(s.feedConsumedKg), biaya_pakan: num(s.feedCost),
    }));
  }

  if (type === "flock") {
    const flocks = await prisma.flock.findMany({
      where: { ...scope, deletedAt: null, ...(f.flockId ? { id: BigInt(f.flockId) } : {}) },
      include: { strain: { select: { name: true } }, house: { select: { code: true } },
        summaries: { where: { periodType: "CYCLE" } } },
      orderBy: { code: "asc" },
    });
    return flocks.map((fl) => {
      const c = fl.summaries[0];
      return {
        flock: fl.code, strain: fl.strain.name, kandang: fl.house.code, status: fl.status,
        populasi_awal: fl.initialPopulation, tanggal_menetas: fl.hatchDate.toISOString().slice(0, 10),
        total_telur: c?.totalEggs ?? null, hdp_kumulatif_pct: num(c?.hdpPct ?? null),
        fcr_kumulatif: num(c?.fcr ?? null), mortalitas_kumulatif_pct: num(c?.cumMortalityPct ?? null),
        deplesi_pct: num(c?.depletionPct ?? null), pakan_kg: num(c?.feedConsumedKg ?? null),
        biaya_pakan: num(c?.feedCost ?? null),
      };
    });
  }

  if (type === "treatments") {
    const treatments = await prisma.treatment.findMany({
      where: { ...scope, deletedAt: null, ...(f.flockId ? { flockId: BigInt(f.flockId) } : {}),
        ...(range ? { startDate: range } : {}) },
      include: { category: { select: { name: true } }, flock: { select: { code: true } }, house: { select: { code: true } } },
      orderBy: { startDate: "desc" },
    });
    return treatments.map((t) => ({
      tanggal_mulai: t.startDate.toISOString().slice(0, 10),
      tanggal_selesai: t.endDate?.toISOString().slice(0, 10) ?? null,
      flock: t.flock.code, kandang: t.house.code, kategori: t.category.name, nama: t.name,
      dosis: num(t.dose), satuan: t.doseUnit, cara: t.route,
      withdrawal_sampai: t.withdrawalUntil?.toISOString().slice(0, 10) ?? null,
      biaya: num(t.cost), status: t.status,
    }));
  }

  if (type === "mortality") {
    const recs = await prisma.dailyRecord.findMany({
      where: { ...scope, deletedAt: null, ...(f.flockId ? { flockId: BigInt(f.flockId) } : {}),
        ...(range ? { recordDate: range } : {}) },
      include: { population: true, flock: { select: { code: true } }, house: { select: { code: true } } },
      orderBy: { recordDate: "asc" },
    });
    return recs.filter((r) => r.population).map((r) => ({
      tanggal: r.recordDate.toISOString().slice(0, 10), kandang: r.house.code, flock: r.flock.code,
      populasi_awal: r.population!.openingPopulation, mati: r.population!.mortality,
      afkir: r.population!.culling, populasi_akhir: r.population!.closingPopulation,
    }));
  }

  // incomplete: kandang aktif tanpa recording pada tanggal 'to' (atau hari ini)
  const day = f.to ?? new Date().toISOString().slice(0, 10);
  const dayDate = new Date(`${day}T00:00:00Z`);
  const activeFlocks = await prisma.flock.findMany({
    where: { ...scope, status: "ACTIVE", deletedAt: null },
    include: { house: { select: { code: true } } },
  });
  const recorded = await prisma.dailyRecord.findMany({
    where: { recordDate: dayDate, flockId: { in: activeFlocks.map((x) => x.id) }, deletedAt: null },
    select: { flockId: true },
  });
  const recordedSet = new Set(recorded.map((r) => r.flockId.toString()));
  return activeFlocks.filter((fl) => !recordedSet.has(fl.id.toString())).map((fl) => ({
    tanggal: day, kandang: fl.house.code, flock: fl.code, status: "BELUM DIINPUT",
  }));
}
