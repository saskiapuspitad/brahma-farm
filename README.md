# BrahmaFarm — Sistem Recording Produksi Ayam Petelur Multi-Kandang

Aplikasi web recording produksi ayam petelur: kelola kandang & flock, input recording harian cepat, hitung indikator produktivitas otomatis (HDP, HHP, egg mass, FCR, mortalitas, deplesi), catat perlakuan, dashboard, dan peringatan dini.

**Stack:** Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL 16 · Tailwind CSS · Recharts · Zod · Auth JWT (jose) · argon2 · Vitest.

Dokumen desain lengkap (Bagian 1–7): lihat [`DESIGN.md`](./DESIGN.md).

---

## Status MVP (Bagian 8 — Implementasi)

Yang sudah terimplementasi dan **teruji** (48 unit test hijau):

| Modul | Lokasi | Status |
|---|---|---|
| Domain rumus indikator | `src/domain/indicators/formulas.ts` | ✅ + test |
| Mutasi & propagasi populasi | `src/domain/indicators/population.ts` | ✅ + test |
| Umur ayam | `src/domain/indicators/age.ts` | ✅ + test |
| Pembulatan tampilan | `src/domain/indicators/rounding.ts` | ✅ + test |
| Peringatan dini rule-based | `src/domain/alerts/rules.ts` | ✅ + test |
| Skema database | `prisma/schema.prisma` (+ `migrations/manual_partial_indexes.sql`) | ✅ |
| Auth (login/logout/me), JWT, hashing | `src/lib/auth.ts`, `src/app/api/auth/*` | ✅ |
| RBAC + cakupan farm | `src/lib/rbac.ts` | ✅ |
| Service recording (transaksi, validasi, audit) | `src/services/recording.service.ts` | ✅ |
| Service indikator (simpan & recompute) | `src/services/indicator.service.ts` | ✅ |
| Service dashboard & settings | `src/services/*.service.ts` | ✅ |
| Domain lifecycle flock (aktivasi/penutupan, transisi) | `src/domain/flock/lifecycle.ts` | ✅ + test |
| Service+API Farm/House/Flock (CRUD, aktivasi, afkir, assignment) | `src/services/*.service.ts`, `src/app/api/{farms,houses,flocks,strains}/*` | ✅ |
| API recording, prefill, dashboard | `src/app/api/*` | ✅ |
| Frontend: login, dashboard + grafik, form recording (indikator langsung) | `src/app/**` | ✅ |
| Frontend: Kandang (list+form), Flock (list+form), Detail flock (siklus, grafik, aktivasi/afkir, riwayat) | `src/app/(dashboard)/{houses,flocks}/**` | ✅ |
| Recording: riwayat, detail, koreksi (audit + recompute berantai populasi), verifikasi, kunci/buka periode | `src/services/recording-correction.service.ts`, `src/app/api/recordings/**`, `src/app/(dashboard)/recording/**` | ✅ |
| Perlakuan: service+API+halaman (list, form, timeline, withdrawal) | `src/services/treatment.service.ts`, `src/app/api/treatments/**`, `src/app/(dashboard)/treatments/**` | ✅ |
| Peringatan: pusat peringatan + tindak lanjut | `src/services/alert.service.ts`, `src/app/api/alerts/**`, `src/app/(dashboard)/alerts` | ✅ |
| Standar performa: CRUD + impor CSV | `src/app/api/standards/**`, `src/app/(dashboard)/standards` | ✅ |
| Laporan + ekspor CSV (harian, flock, perlakuan, mortalitas, belum lengkap) | `src/services/report.service.ts`, `src/app/api/reports/**`, `src/app/(dashboard)/reports` | ✅ |
| Manajemen pengguna (buat + tetapkan peran) & Pengaturan sistem (basis populasi, istilah) | `src/app/api/{users,settings}/**`, `src/app/(dashboard)/{users,settings}` | ✅ |
| Ekspor laporan **Excel (.xlsx) & PDF native** + CSV | `src/services/export.service.ts`, `src/app/api/reports/[type]` | ✅ |
| **Impor massal recording lama (CSV)**: template, pratinjau, validasi, penandaan error, cegah duplikasi, riwayat | `src/services/import.service.ts`, `src/app/api/imports/**`, `src/app/(dashboard)/imports` | ✅ |
| **PWA / offline**: service worker, manifest, simpan draft & outbox recording saat offline lalu sinkron otomatis | `public/{sw.js,manifest.webmanifest}`, `src/lib/offline.ts`, `src/components/PwaProvider.tsx` | ✅ |
| Seed data | `prisma/seed.ts` | ✅ |
| Docker Compose + Dockerfile | `docker-compose.yml`, `Dockerfile` | ✅ |

Arsitektur berlapis: **Presentation** (`app/`, `components/`) → **Service** (`services/`) → **Domain murni & teruji** (`domain/`) → **Data access** (Prisma). Rumus tidak pernah ditaruh hanya di frontend — frontend memakai fungsi domain yang sama untuk *preview*, sedangkan nilai yang disimpan selalu dihitung ulang di server.

Seluruh alur sudah lengkap & dapat dijalankan lewat UI: peternakan → kandang → flock → recording harian (dengan **mode offline**) → indikator → dashboard → perlakuan → peringatan → laporan + **ekspor Excel/PDF/CSV** → koreksi/verifikasi/kunci → **impor massal recording lama** → siklus flock. Yang masih di roadmap (opsional): agregasi mingguan/bulanan tersimpan sebagai ringkasan, integrasi sensor/timbangan, notifikasi push, dan deteksi anomali ML (tahap lanjut). Domain teruji dengan 60 unit test.

---

## Bagian 9 — Menjalankan Aplikasi

### A. Lokal (tanpa Docker)

Prasyarat: Node.js 20+/22, PostgreSQL 16, npm.

```bash
# 1. Instal dependency
npm install

# 2. Konfigurasi environment
cp .env.example .env
#   Edit .env: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
#   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
#   Buat secret: openssl rand -base64 48

# 3. Buat database (contoh)
createdb brahmafarm   # atau via psql: CREATE DATABASE brahmafarm;

# 4. Jalankan migration (buat semua tabel)
npx prisma migrate dev --name init
#   lalu index/constraint parsial (sekali):
psql "$DATABASE_URL" -f prisma/migrations/manual_partial_indexes.sql

# 5. Jalankan seed (roles, strain, admin, farm & flock contoh)
npm run seed

# 6. Jalankan backend + frontend (dev)
npm run dev
#   Buka http://localhost:3000 — login dengan SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD

# 7. Jalankan test rumus & validasi
npm test
```

Build produksi: `npm run build && npm run start`.

### B. Dengan Docker Compose

```bash
cp .env.example .env   # set JWT_* & SEED_ADMIN_* minimal
docker compose up --build
#   Compose akan: migrate deploy → seed → start.
#   Setelah web berjalan, terapkan index parsial sekali:
docker compose exec db psql -U brahma -d brahmafarm -f - < prisma/migrations/manual_partial_indexes.sql
```
Akses: http://localhost:3000.

### C. Membuat akun admin awal
Akun super admin dibuat otomatis oleh `prisma/seed.ts` dari `SEED_ADMIN_EMAIL` & `SEED_ADMIN_PASSWORD`. Ganti password setelah login pertama (endpoint manajemen user — tahap berikut). Admin peternakan & petugas kandang dibuat oleh super admin lewat modul Manajemen Pengguna.

### Catatan
- `npx prisma generate` dijalankan otomatis saat `npm install` (postinstall Prisma) / build Docker; jika perlu manual: `npm run prisma:generate`.
- Rumus indikator dapat diverifikasi terpisah tanpa DB: `npm run test:unit`.

---

## Bagian 10 — Roadmap Pengembangan

### MVP (fondasi — sebagian besar sudah ada)
Kandang, flock, recording harian, perhitungan indikator (teruji), perlakuan (schema+service), dashboard, laporan dasar. Berikutnya melengkapi halaman CRUD (flock/kandang/perlakuan), koreksi+verifikasi+lock via UI, agregasi mingguan/bulanan tersimpan, dan pusat peringatan.

### Tahap kedua
- Stok & pembelian pakan, biaya produksi.
- Notifikasi (email/WhatsApp/push) untuk peringatan kritis & withdrawal.
- PWA / mode offline (draft recording tersimpan lokal lalu sinkron).
- Impor massal lengkap (template, pratinjau, penandaan error) + ekspor Excel/PDF.
- Integrasi sensor lingkungan & timbangan; benchmark antar-strain.
- Background job (BullMQ + Redis) untuk recompute & notifikasi.

### Tahap lanjutan
- Deteksi anomali (ML) menggantikan/menyempurnakan threshold rule-based.
- Prediksi produksi & prediksi penurunan HDP.
- Analisis respons sebelum/sesudah perlakuan (tetap deskriptif, dengan uji statistik yang tepat — bukan klaim kausal otomatis).
- Decision support system & integrasi IoT / precision livestock farming.

---

## Batasan yang dihormati
Data aktual, target perusahaan, dan standar strain disimpan terpisah. Standar strain berupa placeholder ber-`source_label` — **bukan** standar biologis resmi. FCR tidak dihitung bila massa telur nol. Nilai turunan selalu dapat dihitung ulang dari data mentah. Logika rumus berada di domain layer, bukan hanya frontend. Perubahan setelah perlakuan **tidak** dianggap bukti kausalitas. Riwayat flock/kandang tidak dihapus (soft delete + audit trail). Antarmuka & dokumentasi Bahasa Indonesia; nama tabel/kolom/class/function/endpoint Bahasa Inggris.
