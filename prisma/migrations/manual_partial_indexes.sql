-- Index & constraint yang tidak dapat diekspresikan penuh di schema.prisma.
-- Jalankan SEKALI setelah `prisma migrate deploy` pada database yang sama.
--   psql "$DATABASE_URL" -f prisma/migrations/manual_partial_indexes.sql

-- 1) Satu recording utama per (flock, tanggal) yang belum dihapus (soft delete aware).
CREATE UNIQUE INDEX IF NOT EXISTS uq_record_per_day_active
  ON daily_records (flock_id, record_date)
  WHERE deleted_at IS NULL;

-- 2) Hanya satu flock aktif (assignment terbuka) per kandang.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_assignment
  ON house_assignments (house_id)
  WHERE end_date IS NULL;

-- 3) CHECK integritas mutasi populasi (pertahanan lapis DB, selain validasi domain).
ALTER TABLE daily_populations
  DROP CONSTRAINT IF EXISTS chk_population_identity;
ALTER TABLE daily_populations
  ADD CONSTRAINT chk_population_identity
  CHECK (closing_population = opening_population - mortality - culling + transfer_in - transfer_out);

ALTER TABLE daily_populations
  DROP CONSTRAINT IF EXISTS chk_population_nonneg;
ALTER TABLE daily_populations
  ADD CONSTRAINT chk_population_nonneg
  CHECK (mortality >= 0 AND culling >= 0 AND transfer_in >= 0 AND transfer_out >= 0
         AND opening_population >= 0 AND closing_population >= 0
         AND mortality + culling <= opening_population + transfer_in);

-- 4) CHECK konsistensi total telur = jumlah kategori.
ALTER TABLE egg_productions
  DROP CONSTRAINT IF EXISTS chk_total_eggs;
ALTER TABLE egg_productions
  ADD CONSTRAINT chk_total_eggs
  CHECK (total_eggs = whole_eggs + cracked_eggs + broken_eggs + dirty_eggs + abnormal_eggs);
