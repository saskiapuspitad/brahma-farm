import { AppError } from "./errors";

/**
 * Rate limiter in-memory sederhana (cukup untuk MVP/single instance).
 * Tahap 2: ganti dengan Redis token-bucket agar konsisten lintas instance.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new AppError("RATE_LIMITED", "Terlalu banyak permintaan, coba lagi nanti");
  }
}

export function clientKey(req: Request, suffix: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  return `${suffix}:${ip}`;
}
