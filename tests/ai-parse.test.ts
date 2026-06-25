import { describe, it, expect } from "vitest";
import { parseJsonObject } from "@/lib/ai/parse";

// parseJsonObject is the pure fallback extracted from lib/ai/index.ts's jsonCall.
// The contract every AI wrapper (extractDocument / recognizeAsset / estimateValue /
// ragAnswer) leans on: a flaky or truncated model NEVER throws — it degrades to an
// empty draft the user can retry. These tests pin that contract so a future refactor
// of the model call can't silently turn a parse miss into a 500.
describe("parseJsonObject — model JSON fallback", () => {
  describe("malformed / unusable model output -> {} (never throws)", () => {
    it("returns {} for an empty string", () => {
      expect(parseJsonObject("")).toEqual({});
    });

    it("returns {} for null / undefined (missing message content)", () => {
      expect(parseJsonObject(null)).toEqual({});
      expect(parseJsonObject(undefined)).toEqual({});
    });

    it("returns {} for truncated JSON (max_completion_tokens cutoff)", () => {
      expect(parseJsonObject('{"category":"invoice","amount":')).toEqual({});
      expect(parseJsonObject('{"supplier":"ČEZ", "items":[{"x":1},')).toEqual({});
    });

    it("returns {} for prose / markdown-fenced output that is not JSON", () => {
      expect(parseJsonObject("Omlouvám se, nemohu dokument přečíst.")).toEqual({});
      expect(parseJsonObject("```json\n{\"a\":1}\n```")).toEqual({});
    });

    it("returns {} for trailing-comma / single-quote near-JSON", () => {
      expect(parseJsonObject('{"a":1,}')).toEqual({});
      expect(parseJsonObject("{'a':1}")).toEqual({});
    });

    it("does not throw for any of a batch of broken inputs", () => {
      for (const bad of ["", "{", "}", "[", "null}", "{}{", "NaN", "undefined", "{a:1}"]) {
        expect(() => parseJsonObject(bad)).not.toThrow();
      }
    });
  });

  describe("well-formed model output is parsed through", () => {
    it("parses a real extraction object with Czech diacritics intact", () => {
      const raw = JSON.stringify({
        category: "inspection",
        supplier: "Revize Plyn s.r.o.",
        summary: "Revizní zpráva — plynové zařízení v pořádku.",
        confidence: 0.9,
      });
      expect(parseJsonObject(raw)).toEqual({
        category: "inspection",
        supplier: "Revize Plyn s.r.o.",
        summary: "Revizní zpráva — plynové zařízení v pořádku.",
        confidence: 0.9,
      });
    });

    it("parses an empty JSON object literal", () => {
      expect(parseJsonObject("{}")).toEqual({});
    });

    it("preserves nested structures and numbers", () => {
      expect(parseJsonObject('{"low":1000,"high":3000,"currency":"CZK"}')).toEqual({
        low: 1000,
        high: 3000,
        currency: "CZK",
      });
    });
  });
});
