"use client";

/**
 * Outbox offline untuk recording: bila jaringan mati, POST recording disimpan
 * di localStorage lalu dikirim ulang saat kembali online. Semua akses dibungkus
 * try/catch agar aman di lingkungan tanpa localStorage.
 */
const OUTBOX_KEY = "brahmafarm.outbox";
const DRAFT_PREFIX = "brahmafarm.draft.";

export interface OutboxItem {
  id: string;
  createdAt: number;
  body: unknown;
}

export function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

export function addToOutbox(body: unknown): void {
  try {
    const items = readOutbox();
    items.push({ id: `${Date.now()}-${items.length}`, createdAt: Date.now(), body });
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch { /* abaikan */ }
}

export function removeFromOutbox(id: string): void {
  try {
    const items = readOutbox().filter((i) => i.id !== id);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch { /* abaikan */ }
}

/** Kirim ulang seluruh outbox. Mengembalikan jumlah yang berhasil terkirim. */
export async function flushOutbox(): Promise<number> {
  const items = readOutbox();
  let sent = 0;
  for (const item of items) {
    try {
      const res = await fetch("/api/recordings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body),
      });
      const json = await res.json();
      if (json.success || json.error?.code === "CONFLICT") {
        // sukses, atau sudah ada (duplikat) → anggap selesai
        removeFromOutbox(item.id);
        sent++;
      }
    } catch {
      break; // masih offline
    }
  }
  return sent;
}

// ---- Draft form (per kandang+tanggal) ----
export function saveDraft(key: string, data: unknown): void {
  try { localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(data)); } catch { /* abaikan */ }
}
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function clearDraft(key: string): void {
  try { localStorage.removeItem(DRAFT_PREFIX + key); } catch { /* abaikan */ }
}
