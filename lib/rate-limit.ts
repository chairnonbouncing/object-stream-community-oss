import { headers } from "next/headers";

/**
 * Fixed-window in-memory rate limiter. The site runs as a single instance
 * (Render free tier), so process-local state is the whole picture; if we ever
 * scale out, swap the Map for Redis without changing call sites.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

/** Returns true when the call is allowed, false when over the limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

/** Best-effort client IP for keying limits (Render sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export const RATE_LIMIT_MESSAGE = "Too many attempts — wait a bit and try again.";
