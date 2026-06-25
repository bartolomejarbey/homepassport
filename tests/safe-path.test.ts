import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/app/(auth)/_components/safe-path";

const FALLBACK = "/prehled";

describe("safeNextPath — open-redirect guard", () => {
  describe("rejects unsafe values (returns fallback)", () => {
    it("rejects null / undefined / empty", () => {
      expect(safeNextPath(null)).toBe(FALLBACK);
      expect(safeNextPath(undefined)).toBe(FALLBACK);
      expect(safeNextPath("")).toBe(FALLBACK);
    });

    it("rejects protocol-relative //evil.com", () => {
      expect(safeNextPath("//evil.com")).toBe(FALLBACK);
      expect(safeNextPath("//evil.com/path")).toBe(FALLBACK);
    });

    it("rejects backslash protocol-relative /\\evil", () => {
      expect(safeNextPath("/\\evil")).toBe(FALLBACK);
      expect(safeNextPath("/\\evil.com/x")).toBe(FALLBACK);
    });

    it("rejects absolute URLs with a scheme", () => {
      expect(safeNextPath("https://evil.com")).toBe(FALLBACK);
      expect(safeNextPath("http://evil.com")).toBe(FALLBACK);
      expect(safeNextPath("javascript:alert(1)")).toBe(FALLBACK);
    });

    it("rejects values not starting with a slash", () => {
      expect(safeNextPath("evil.com")).toBe(FALLBACK);
      expect(safeNextPath("prehled")).toBe(FALLBACK);
    });

    it("rejects control characters (CR/LF/NUL/tab) used for header or path injection", () => {
      expect(safeNextPath("/pro\n//evil.com")).toBe(FALLBACK);
      expect(safeNextPath("/pro\r\nSet-Cookie: x")).toBe(FALLBACK);
      expect(safeNextPath("/pro\x00")).toBe(FALLBACK);
      expect(safeNextPath("/pro\tnext")).toBe(FALLBACK);
    });

    it("rejects auth-prefix loops (exact match)", () => {
      expect(safeNextPath("/prihlaseni")).toBe(FALLBACK);
      expect(safeNextPath("/registrace")).toBe(FALLBACK);
      expect(safeNextPath("/zapomenute-heslo")).toBe(FALLBACK);
      expect(safeNextPath("/nove-heslo")).toBe(FALLBACK);
      expect(safeNextPath("/auth")).toBe(FALLBACK);
    });

    it("rejects auth-prefix loops (nested paths and with query/hash)", () => {
      expect(safeNextPath("/prihlaseni/foo")).toBe(FALLBACK);
      expect(safeNextPath("/auth/callback")).toBe(FALLBACK);
      expect(safeNextPath("/prihlaseni?next=/pro")).toBe(FALLBACK);
      expect(safeNextPath("/registrace#x")).toBe(FALLBACK);
    });
  });

  describe("allows safe same-origin paths (returned verbatim)", () => {
    it("allows /pro", () => {
      expect(safeNextPath("/pro")).toBe("/pro");
    });

    it("allows a takeover path with a token /prevzit/<token>", () => {
      const token = "a1b2c3d4-e5f6-7890-abcd-ef0123456789";
      expect(safeNextPath(`/prevzit/${token}`)).toBe(`/prevzit/${token}`);
    });

    it("allows paths with query strings and fragments", () => {
      expect(safeNextPath("/nemovitost/123?tab=revize")).toBe("/nemovitost/123?tab=revize");
      expect(safeNextPath("/prehled#section")).toBe("/prehled#section");
    });

    it("does not confuse a non-auth path that merely contains an auth word", () => {
      // "/prihlaseni-historie" must NOT match the "/prihlaseni" prefix (only "/" or exact).
      expect(safeNextPath("/prihlaseni-historie")).toBe("/prihlaseni-historie");
      expect(safeNextPath("/authentikace")).toBe("/authentikace");
    });

    it("uses a custom fallback when provided", () => {
      expect(safeNextPath(null, "/pro")).toBe("/pro");
      expect(safeNextPath("//evil.com", "/pro")).toBe("/pro");
    });
  });
});
