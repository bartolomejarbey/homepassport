import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn — class merge helper", () => {
  it("joins multiple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values (clsx behavior)", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional object syntax", () => {
    expect(cn("base", { active: true, hidden: false })).toBe("base active");
  });

  it("flattens arrays of classes", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("merges conflicting tailwind utilities — last one wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });

  it("keeps non-conflicting tailwind utilities", () => {
    expect(cn("px-2 py-1", "text-caramel")).toBe("px-2 py-1 text-caramel");
  });

  it("resolves conflicts across conditional inputs", () => {
    expect(cn("p-2", { "p-4": true })).toBe("p-4");
  });

  it("returns an empty string for no/empty input", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });
});
