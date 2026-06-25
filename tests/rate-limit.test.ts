import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimit, __resetRateLimit } from "@/lib/util/rate-limit";

// Unit tests for the per-user in-memory AI cost guard. The limiter is a
// fixed-window counter keyed by `${bucket}:${id}`; these assert the contract the
// AI routes rely on: N allowed, the (N+1)-th blocked with a positive Retry-After,
// the window rolling over after windowMs, and buckets/users staying isolated.

beforeEach(() => {
  __resetRateLimit();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows up to the limit, then blocks the next request", () => {
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      const r = rateLimit("ai:test", "user-1", limit, 60_000);
      expect(r.ok).toBe(true);
    }
    const blocked = rateLimit("ai:test", "user-1", limit, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("reports a decreasing remaining allowance", () => {
    expect(rateLimit("b", "u", 3, 60_000).remaining).toBe(2);
    expect(rateLimit("b", "u", 3, 60_000).remaining).toBe(1);
    expect(rateLimit("b", "u", 3, 60_000).remaining).toBe(0);
  });

  it("opens a fresh window after windowMs elapses", () => {
    const limit = 2;
    expect(rateLimit("b", "u", limit, 1_000).ok).toBe(true);
    expect(rateLimit("b", "u", limit, 1_000).ok).toBe(true);
    expect(rateLimit("b", "u", limit, 1_000).ok).toBe(false); // window full

    // Advance past the window — the counter resets.
    vi.advanceTimersByTime(1_001);
    const after = rateLimit("b", "u", limit, 1_000);
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(limit - 1);
  });

  it("isolates different users", () => {
    expect(rateLimit("b", "alice", 1, 60_000).ok).toBe(true);
    expect(rateLimit("b", "alice", 1, 60_000).ok).toBe(false); // alice exhausted
    expect(rateLimit("b", "bob", 1, 60_000).ok).toBe(true); // bob unaffected
  });

  it("isolates different buckets for the same user", () => {
    expect(rateLimit("ai:search", "u", 1, 60_000).ok).toBe(true);
    expect(rateLimit("ai:search", "u", 1, 60_000).ok).toBe(false);
    // A different route's bucket has its own allowance.
    expect(rateLimit("ai:value", "u", 1, 60_000).ok).toBe(true);
  });

  it("retryAfter is a whole number of seconds within the window", () => {
    rateLimit("b", "u", 1, 10_000);
    const blocked = rateLimit("b", "u", 1, 10_000);
    expect(blocked.ok).toBe(false);
    expect(Number.isInteger(blocked.retryAfter)).toBe(true);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfter).toBeLessThanOrEqual(10);
  });
});
