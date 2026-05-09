import { describe, expect, it, vi, afterEach } from 'vitest';
import { RateLimiter } from '../../src/server/rate-limiter.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter(5);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('1.2.3.4').allowed).toBe(true);
    }
  });

  it('blocks the request that exceeds the limit', () => {
    const limiter = new RateLimiter(3);
    limiter.check('1.2.3.4');
    limiter.check('1.2.3.4');
    limiter.check('1.2.3.4');
    const result = limiter.check('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks different IPs independently', () => {
    const limiter = new RateLimiter(2);
    limiter.check('192.168.0.1');
    limiter.check('192.168.0.1');
    // First IP is exhausted
    expect(limiter.check('192.168.0.1').allowed).toBe(false);
    // Second IP is independent
    expect(limiter.check('192.168.0.2').allowed).toBe(true);
    expect(limiter.check('192.168.0.2').allowed).toBe(true);
    expect(limiter.check('192.168.0.2').allowed).toBe(false);
  });

  it('allows requests again after the window expires', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(2);
    limiter.check('10.0.0.1');
    limiter.check('10.0.0.1');
    expect(limiter.check('10.0.0.1').allowed).toBe(false);

    // Advance clock by 61 seconds (past the 60-second window)
    vi.advanceTimersByTime(61_000);
    expect(limiter.check('10.0.0.1').allowed).toBe(true);
  });

  it('returns retryAfterSeconds >= 1 when blocked', () => {
    const limiter = new RateLimiter(1);
    limiter.check('5.5.5.5');
    const result = limiter.check('5.5.5.5');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(result.retryAfterSeconds)).toBe(true);
  });

  it('returns retryAfterSeconds 0 when allowed', () => {
    const limiter = new RateLimiter(10);
    const result = limiter.check('6.6.6.6');
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });
});
