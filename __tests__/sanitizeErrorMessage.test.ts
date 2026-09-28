import { describe, it, expect } from "vitest";
import { sanitizeErrorMessage } from "../logger";

describe("sanitizeErrorMessage", () => {
  it("redacts a UUID-shaped Notion id from the message", () => {
    const err = new Error("Nie można znaleźć bazy danych o ID: 254fda05-810e-8104-b669-eeb829a11688. Sprawdź dostęp.");
    const out = sanitizeErrorMessage(err, "fallback");
    expect(out).not.toContain("254fda05");
    expect(out).toContain("[id]");
    expect(out).toContain("Nie można znaleźć bazy danych"); // useful text kept
  });

  it("redacts a bare 32-hex id too", () => {
    const err = new Error("Could not find database 254fda05810e8104b669eeb829a11688 in workspace");
    expect(sanitizeErrorMessage(err, "fallback")).toBe("Could not find database [id] in workspace");
  });

  it("falls back when there's no usable message", () => {
    expect(sanitizeErrorMessage({}, "fallback")).toBe("fallback");
    expect(sanitizeErrorMessage(null, "fallback")).toBe("fallback");
    expect(sanitizeErrorMessage(new Error("   "), "fallback")).toBe("fallback");
  });

  it("leaves an id-free message unchanged", () => {
    expect(sanitizeErrorMessage(new Error("Kolumna Źródło nie istnieje"), "fb")).toBe("Kolumna Źródło nie istnieje");
  });

  it("redacts every id when several appear", () => {
    const err = new Error("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4 vs f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3");
    expect(sanitizeErrorMessage(err, "fb")).toBe("[id] vs [id]");
  });
});
