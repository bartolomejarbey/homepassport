import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Unit tests for lib/env.ts — the runtime env validator. Two contracts:
//   1) required vars missing -> ONE readable, bilingual error listing the keys;
//   2) the exported `env` is LAZY (validates on first access, not at import), so
//      `next build` with absent envs stays green. We exercise both by snapshotting
//      process.env, resetting the module cache (assertEnv memoizes) and re-importing.
// No network, no DB: pure schema logic against a stubbed process.env.

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  OPENAI_API_KEY: "sk-test",
  AI_MODEL: "gpt-5.5",
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  // Fresh, isolated env so host-provided vars don't leak into assertions.
  process.env = { ...REQUIRED } as unknown as NodeJS.ProcessEnv;
  vi.resetModules();
});

afterEach(() => {
  process.env = saved;
  vi.resetModules();
});

async function loadEnv() {
  return await import("@/lib/env");
}

describe("assertEnv", () => {
  it("parses a complete env and exposes typed values", async () => {
    const { assertEnv } = await loadEnv();
    const e = assertEnv();
    expect(e.NEXT_PUBLIC_SUPABASE_URL).toBe("https://demo.supabase.co");
    expect(e.AI_MODEL).toBe("gpt-5.5");
    // Unset optionals are undefined, not throwing.
    expect(e.RESEND_API_KEY).toBeUndefined();
  });

  it("throws a bilingual error listing every missing required var", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { assertEnv } = await loadEnv();
    expect(() => assertEnv()).toThrow(/OPENAI_API_KEY/);
    try {
      assertEnv();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("SUPABASE_SERVICE_ROLE_KEY");
      // Both languages present.
      expect(msg).toContain("Chybná konfigurace prostředí");
      expect(msg).toContain("Invalid environment configuration");
      // Never echoes a value that IS set (no secret leakage).
      expect(msg).not.toContain("gpt-5.5");
    }
  });

  it("rejects a malformed required URL", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    const { assertEnv } = await loadEnv();
    expect(() => assertEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("accepts optional vars when present and coerces AI_TIMEOUT_MS", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.AI_TIMEOUT_MS = "5000";
    const { assertEnv } = await loadEnv();
    const e = assertEnv();
    expect(e.RESEND_API_KEY).toBe("re_test");
    expect(e.AI_TIMEOUT_MS).toBe(5000);
  });

  it("memoizes — repeated calls return the same parsed object", async () => {
    const { assertEnv } = await loadEnv();
    expect(assertEnv()).toBe(assertEnv());
  });
});

describe("env proxy (lazy)", () => {
  it("does not validate at import time (build-safe)", async () => {
    delete process.env.OPENAI_API_KEY; // would fail validation
    // Importing the module must NOT throw even with a broken env.
    await expect(loadEnv()).resolves.toBeDefined();
  });

  it("validates on first property access", async () => {
    delete process.env.OPENAI_API_KEY;
    const { env } = await loadEnv();
    expect(() => env.NEXT_PUBLIC_SUPABASE_URL).toThrow(/OPENAI_API_KEY/);
  });

  it("reads values lazily through the proxy when env is valid", async () => {
    const { env } = await loadEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-key");
  });
});
