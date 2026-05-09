/**
 * Sliding-window rate limiter keyed by IP address.
 * Counts requests in a rolling 60-second window. No external dependencies.
 */
export class RateLimiter {
  private readonly windowMs = 60_000;
  private readonly store = new Map<string, number[]>();

  constructor(private readonly maxPerMinute: number) {}

  check(ip: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const timestamps = (this.store.get(ip) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= this.maxPerMinute) {
      // Oldest timestamp in the window determines when the slot reopens
      const retryAfterMs = timestamps[0]! + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    timestamps.push(now);
    this.store.set(ip, timestamps);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
