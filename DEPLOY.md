# Panduan Deploy BrahmaFarm ke VPS Hostinger (KVM 2)

Panduan ini untuk VPS Ubuntu yang **sudah menjalankan 1 aplikasi lain**. Tujuannya BrahmaFarm berjalan berdampingan tanpa bentrok, diakses lewat **subdomain** dengan HTTPS.

## Ringkasan keputusan

- **Perlu domain baru?** Tidak. Pakai **subdomain** dari domain yang sudah ada, mis. `farm.brahmaps.online`. Cukup tambah 1 DNS record (gratis).
- **Metode:** Docker Compose (aplikasi + PostgreSQL sendiri, terisolasi) + **nginx** sebagai reverse proxy + **Let's Encrypt** untuk SSL.
- **Anti-bentrok:** container web dipetakan ke `127.0.0.1:3001` (bukan publik), database tidak diekspos ke host. Aplikasi lama Anda tidak tersentuh.

---

## Langkah 1 — Arahkan subdomain ke VPS (DNS)

Di panel pengelola domain Anda (Hostinger hPanel → Domains → DNS), tambах record:

```
Type: A     Name: farm           Points to: <IP_VPS_ANDA>     TTL: 3600
```

`Name` = `farm` akan menghasilkan `farm.brahmaps.online`. Tunggu beberapa menit s.d. 1 jam untuk propagasi. Cek: `ping farm.brahmaps.online` harus mengarah ke IP VPS.

> IP VPS bisa dilihat di hPanel → VPS. Login VPS: `ssh root@<IP_VPS_ANDA>` (atau user Anda).

---

## Langkah 2 — Pastikan Docker terpasang

```bash
docker --version || (curl -fsSL https://get.docker.com | sh)
docker compose version   # harus muncul versi; sudah termasuk di Docker modern
```

---

## Langkah 3 — Ambil kode BrahmaFarm ke VPS

Pilih salah satu.

**Opsi A — via Git (disarankan bila kode ada di GitHub/GitLab):**
```bash
mkdir -p /opt/apps && cd /opt/apps
git clone <URL_REPO_ANDA> brahmafarm
cd brahmafarm
```

**Opsi B — upload manual (zip):** dari komputer Anda,
```bash
# di komputer lokal (folder BrahmaFarm), buat zip tanpa node_modules:
zip -r brahmafarm.zip . -x 'node_modules/*' '.next/*' '.git/*'
scp brahmafarm.zip root@<IP_VPS>:/opt/apps/
# lalu di VPS:
cd /opt/apps && unzip brahmafarm.zip -d brahmafarm && cd brahmafarm
```

---

## Langkah 4 — Buat file konfigurasi `.env`

```bash
cp .env.example .env
nano .env
```

Isi minimal (buat secret kuat, jangan pakai contoh apa adanya):

```
POSTGRES_USER=brahma
POSTGRES_PASSWORD=<password-db-acak-kuat>
POSTGRES_DB=brahmafarm

JWT_ACCESS_SECRET=<hasil: openssl rand -base64 48>
JWT_REFRESH_SECRET=<hasil: openssl rand -base64 48 (berbeda)>

SEED_ADMIN_EMAIL=admin@brahmaps.online
SEED_ADMIN_PASSWORD=<password-login-admin-kuat>
SEED_ADMIN_NAME=Administrator
```

Buat secret cepat: jalankan `openssl rand -base64 48` (dua kali untuk dua JWT secret).
`DATABASE_URL` tidak perlu diisi manual — di Docker sudah otomatis mengarah ke container `db`.

---

## Langkah 5 — Jalankan dengan Docker Compose

Pakai nama proyek `brahmafarm` agar terpisah total dari aplikasi lama:

```bash
docker compose -p brahmafarm up -d --build
```

Proses ini akan: build image → nyalakan PostgreSQL → buat semua tabel (`prisma db push`) → terapkan index/constraint → seed admin → start server di `127.0.0.1:3001`.

Cek log & status:
```bash
docker compose -p brahmafarm logs -f web      # Ctrl+C untuk keluar
docker compose -p brahmafarm ps
curl -I http://127.0.0.1:3001                  # harus dapat respons (200/307)
```

Jika port 3001 ternyata sudah dipakai, edit `docker-compose.yml` bagian `ports` web (mis. `127.0.0.1:3002:3000`) lalu `up -d` lagi, dan sesuaikan nginx di langkah berikut.

---

## Langkah 6 — Reverse proxy nginx untuk subdomain

Pasang nginx bila belum ada (kalau aplikasi lama Anda sudah pakai nginx, lewati install):

```bash
which nginx || (apt update && apt install -y nginx)
```

Buat konfigurasi situs baru (tidak mengubah situs aplikasi lama):

```bash
nano /etc/nginx/sites-available/brahmafarm
```

Isi:
```nginx
server {
    listen 80;
    server_name farm.brahmaps.online;

    client_max_body_size 15m;   # untuk unggah lampiran/impor CSV

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Aktifkan & reload:
```bash
ln -s /etc/nginx/sites-available/brahmafarm /etc/nginx/sites-enabled/
nginx -t          # harus "syntax is ok" & "test is successful"
systemctl reload nginx
```

Sekarang `http://farm.brahmaps.online` sudah bisa dibuka.

---

## Langkah 7 — Aktifkan HTTPS (Let's Encrypt, gratis)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d farm.brahmaps.online
```

Ikuti prompt (email, setuju TOS, pilih redirect HTTP→HTTPS). Certbot otomatis mengubah konfigurasi nginx & memasang sertifikat. Perpanjangan otomatis sudah aktif; uji: `certbot renew --dry-run`.

Buka **https://farm.brahmaps.online** → login dengan `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Selesai.

---

## Setelah deploy

**Ganti password admin.** Login lalu buat/atur pengguna di menu Pengguna. (Password awal berasal dari `.env`.)

**Update aplikasi (versi baru):**
```bash
cd /opt/apps/brahmafarm
git pull            # atau upload ulang kode
docker compose -p brahmafarm up -d --build
```
Skema tabel otomatis disinkronkan (`db push`) tiap start; seed bersifat idempotent (tidak menggandakan data).

**Backup database (disarankan rutin/cron):**
```bash
docker compose -p brahmafarm exec db pg_dump -U brahma brahmafarm > /opt/backups/brahmafarm-$(date +%F).sql
```
Restore: `cat file.sql | docker compose -p brahmafarm exec -T db psql -U brahma -d brahmafarm`.

**Firewall:** cukup buka 80 & 443 (dan 22 untuk SSH). Port 3001 & database tidak terbuka ke publik (sudah di-bind ke 127.0.0.1).

---

## Firewall (opsional, bila pakai UFW)
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## Troubleshooting singkat
- **502 Bad Gateway** di nginx → container web belum siap; cek `docker compose -p brahmafarm logs web`.
- **Subdomain belum terbuka** → DNS belum propagasi; cek `dig farm.brahmaps.online`.
- **Bentrok port** → ubah `3001` di `docker-compose.yml` dan `proxy_pass` nginx agar sama.
- **Lupa password admin** → ubah `SEED_ADMIN_PASSWORD` di `.env`, lalu `docker compose -p brahmafarm restart web` (seed meng-upsert admin; atau reset lewat menu Pengguna).
