/**
 * Seed data awal BrahmaFarm.
 * Membuat: roles, strains, kategori perlakuan, super admin (password di-hash),
 * satu farm + kandang + feed type + flock contoh, dan setting basis populasi.
 * Menjalankan: `npm run seed` (butuh DATABASE_URL & argon2).
 *
 * Catatan: performance_standards TIDAK diisi angka biologis di sini kecuali
 * satu baris placeholder dengan source_label eksplisit (lihat DESIGN.md §4.7).
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  // Roles
  const roles = [
    { code: "SUPER_ADMIN", name: "Super Admin", description: "Akses penuh sistem" },
    { code: "FARM_ADMIN", name: "Admin Peternakan", description: "Kelola operasional peternakan" },
    { code: "HOUSE_OPERATOR", name: "Petugas Kandang", description: "Input recording kandang" },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { code: r.code }, create: r, update: { name: r.name, description: r.description } });
  }

  // Strains
  const strains = [
    { code: "ISA_BROWN", name: "ISA Brown", breeder: "Hendrix Genetics" },
    { code: "LOHMANN_BROWN", name: "Lohmann Brown", breeder: "Lohmann Tierzucht" },
    { code: "HYLINE_BROWN", name: "Hy-Line Brown", breeder: "Hy-Line International" },
  ];
  for (const s of strains) {
    await prisma.strain.upsert({ where: { code: s.code }, create: s, update: {} });
  }

  // Treatment categories
  const cats: { code: string; name: string; requiresWithdrawal: boolean }[] = [
    { code: "VACCINATION", name: "Vaksinasi", requiresWithdrawal: false },
    { code: "MEDICATION", name: "Pengobatan", requiresWithdrawal: true },
    { code: "VITAMIN", name: "Vitamin", requiresWithdrawal: false },
    { code: "PROBIOTIC", name: "Probiotik", requiresWithdrawal: false },
    { code: "FEED_ADDITIVE", name: "Feed Additive", requiresWithdrawal: false },
    { code: "FEED_FORMULA_CHANGE", name: "Perubahan Formula Pakan", requiresWithdrawal: false },
    { code: "NUTRITION_EXPERIMENT", name: "Perlakuan Nutrisi Eksperimental", requiresWithdrawal: false },
    { code: "LIGHTING_CHANGE", name: "Perubahan Pencahayaan", requiresWithdrawal: false },
    { code: "TEMPERATURE_MGMT", name: "Manajemen Suhu", requiresWithdrawal: false },
    { code: "SANITATION", name: "Sanitasi", requiresWithdrawal: false },
    { code: "BIOSECURITY", name: "Biosekuriti", requiresWithdrawal: false },
    { code: "SELECTION_CULL", name: "Seleksi/Afkir", requiresWithdrawal: false },
    { code: "OTHER", name: "Lainnya", requiresWithdrawal: false },
  ];
  for (const c of cats) {
    await prisma.treatmentCategory.upsert({ where: { code: c.code }, create: c, update: { name: c.name } });
  }

  // Super admin
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@brahmafarm.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ubah-password-ini";
  const fullName = process.env.SEED_ADMIN_NAME ?? "Super Admin";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, fullName, passwordHash },
    update: { fullName },
  });
  const superRole = await prisma.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  await prisma.userRole.upsert({
    where: { userId_roleId_farmId: { userId: admin.id, roleId: superRole.id, farmId: null as unknown as bigint } },
    create: { userId: admin.id, roleId: superRole.id },
    update: {},
  }).catch(async () => {
    // farmId null pada composite unique bisa berperilaku khusus; fallback createMany aman
    const exists = await prisma.userRole.findFirst({ where: { userId: admin.id, roleId: superRole.id, farmId: null } });
    if (!exists) await prisma.userRole.create({ data: { userId: admin.id, roleId: superRole.id } });
  });

  // Farm + house + feed type + flock contoh
  const farm = await prisma.farm.upsert({
    where: { code: "FARM01" },
    create: { code: "FARM01", name: "Peternakan Brahma", city: "Malang", ownerName: "Saskia" },
    update: {},
  });
  const isa = await prisma.strain.findUniqueOrThrow({ where: { code: "ISA_BROWN" } });
  const house = await prisma.house.upsert({
    where: { farmId_code: { farmId: farm.id, code: "K-01" } },
    create: { farmId: farm.id, code: "K-01", name: "Kandang 01", houseType: "BATTERY", capacity: 5000, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });
  await prisma.feedType.upsert({
    where: { farmId_code: { farmId: farm.id, code: "LAYER-1" } },
    create: { farmId: farm.id, code: "LAYER-1", name: "Layer Fase 1", phase: "LAYING", defaultPricePerKg: 7500 },
    update: {},
  });

  const hatch = new Date(Date.UTC(2026, 1, 26)); // 26 Feb 2026
  const entry = new Date(Date.UTC(2026, 4, 20)); // 20 Mei 2026
  const flock = await prisma.flock.upsert({
    where: { farmId_code: { farmId: farm.id, code: "FLK-2026-01" } },
    create: {
      farmId: farm.id, houseId: house.id, code: "FLK-2026-01", strainId: isa.id,
      hatchDate: hatch, entryDate: entry, initialPopulation: 1000,
      productionPhase: "PEAK", status: "ACTIVE", sourceSupplier: "PT Contoh Unggas",
    },
    update: { status: "ACTIVE" },
  });
  await prisma.houseAssignment.findFirst({ where: { houseId: house.id, endDate: null } }).then(async (a) => {
    if (!a) await prisma.houseAssignment.create({ data: { houseId: house.id, flockId: flock.id, startDate: entry } });
  });

  // Placeholder performance standard (BUKAN standar resmi — source_label eksplisit)
  await prisma.performanceStandard.upsert({
    where: { strainId_ageWeek: { strainId: isa.id, ageWeek: 30 } },
    create: {
      strainId: isa.id, ageWeek: 30, hdpTarget: 93.0, feedIntakeTargetG: 112, eggWeightTargetG: 62.5,
      eggMassTargetG: 58.1, fcrTarget: 1.93, maxMortalityPct: 0.05,
      sourceLabel: "Placeholder – ganti dgn standar breeder resmi",
    },
    update: {},
  });

  // Setting basis populasi = OPENING (keputusan operasional)
  await prisma.systemSetting.upsert({
    where: { farmId_key: { farmId: null as unknown as bigint, key: "hdp_population_basis" } },
    create: { key: "hdp_population_basis", value: "OPENING", description: "Basis populasi untuk HDP/egg mass/feed intake" },
    update: { value: "OPENING" },
  }).catch(async () => {
    const exists = await prisma.systemSetting.findFirst({ where: { farmId: null, key: "hdp_population_basis" } });
    if (!exists) await prisma.systemSetting.create({ data: { key: "hdp_population_basis", value: "OPENING", description: "Basis populasi" } });
  });

  console.log("✓ Seed selesai. Login:", email);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
