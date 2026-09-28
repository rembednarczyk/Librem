import { describe, it, expect } from "vitest";
import { formatReadDate } from "../readDate";

describe("formatReadDate", () => {
  it("shows just the year for a Jan-1 (year-only) date", () => {
    expect(formatReadDate("2017-01-01")).toBe("2017");
  });

  it("shows the full date (DD.MM.YYYY) for a real month/day", () => {
    expect(formatReadDate("2025-08-28")).toBe("28.08.2025");
  });

  it("ignores a time suffix", () => {
    expect(formatReadDate("2025-12-30T00:00:00.000Z")).toBe("30.12.2025");
  });

  it("returns '' for empty / malformed input", () => {
    expect(formatReadDate(undefined)).toBe("");
    expect(formatReadDate(null)).toBe("");
    expect(formatReadDate("")).toBe("");
    expect(formatReadDate("not-a-date")).toBe("");
  });
});
