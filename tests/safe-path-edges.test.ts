import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/app/(auth)/_components/safe-path";

const FALLBACK = "/prehled";

// Supplementary edge cases for the open-redirect guard, picked to NOT overlap
// with safe-path.test.ts. They pin a few boundary decisions that are easy to
// regress when someone "tightens" or rewrites the guard.
describe("safeNextPath — additional edge cases", () => {
  it("uses the DEFAULT fallback (/prehled) when none is passed", () => {
    expect(safeNextPath(undefined)).toBe(FALLBACK);
    expect(safeNextPath("//evil.com")).toBe(FALLBACK);
  });

  it("allows a bare root slash", () => {
    expect(safeNextPath("/")).toBe("/");
  });

  it("auth-prefix match is case-SENSITIVE (exact string compare)", () => {
    // "/Prihlaseni" is not literally "/prihlaseni", so it is NOT folded away.
    // (Routes are lowercase; an uppercased variant simply 404s, it cannot loop.)
    expect(safeNextPath("/Prihlaseni")).toBe("/Prihlaseni");
    expect(safeNextPath("/AUTH")).toBe("/AUTH");
  });

  it("treats an auth prefix with a trailing slash as the auth flow (rejected)", () => {
    expect(safeNextPath("/auth/")).toBe(FALLBACK);
    expect(safeNextPath("/prihlaseni/")).toBe(FALLBACK);
  });

  it("rejects a triple-slash (still protocol-relative under the // rule)", () => {
    expect(safeNextPath("///evil.com")).toBe(FALLBACK);
  });

  it("allows a single-slash path that merely contains a backslash later", () => {
    // Only a LEADING '/\' is the protocol-relative attack; an interior backslash
    // is just an (unusual) path char and stays allowed.
    expect(safeNextPath("/foo\\bar")).toBe("/foo\\bar");
  });

  it("allows a relative dot path under the root", () => {
    expect(safeNextPath("/.")).toBe("/.");
    expect(safeNextPath("/../still-rooted")).toBe("/../still-rooted");
  });

  it("rejects a whitespace-prefixed path (does not start with '/')", () => {
    expect(safeNextPath(" /prehled")).toBe(FALLBACK);
  });

  it("rejects a vertical tab / form feed (within the C0 control range)", () => {
    expect(safeNextPath("/pro\x0b")).toBe(FALLBACK);
    expect(safeNextPath("/pro\x0c")).toBe(FALLBACK);
  });

  it("allows DEL (0x7f) — outside the rejected C0 range, by design of the guard", () => {
    // Documents the exact boundary: the guard rejects \x00-\x1f only.
    expect(safeNextPath("/pro\x7f")).toBe("/pro\x7f");
  });
});
