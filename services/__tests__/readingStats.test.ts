import { describe, it, expect } from "vitest";
import { computeReadingStats } from "../statsAggregator";
import { NotionBook } from "../../src/types";

const b = (id: string, read: boolean, dataPrzeczytania?: string): NotionBook => ({
  id,
  plTitle: `T-${id}`,
  origTitle: `T-${id}`,
  awards: ["Nagroda Hugo"],
  zrodlo: read ? ["Przeczytane"] : [],
  dataPrzeczytania,
});

// Fixed "now" so thisYear / lastYear / recentPace are deterministic.
const NOW = new Date("2026-08-28T12:00:00Z");

describe("computeReadingStats", () => {
  it("counts reads per calendar year from the read date", () => {
    const stats = computeReadingStats([
      b("1", true, "2026-08-28"),
      b("2", true, "2026-02-01"),
      b("3", true, "2025-12-31"),
      b("4", true, "2024-05-05"),
    ], NOW);

    expect(stats.perYear).toEqual([
      { year: 2024, count: 1 },
      { year: 2025, count: 1 },
      { year: 2026, count: 2 },
    ]);
    expect(stats.thisYear).toBe(2);
    expect(stats.lastYear).toBe(1);
  });

  it("treats a year-only (Jan 1) date as a read in that year, not a January event", () => {
    // Both are stored as YYYY-01-01; the stat only reads the YEAR.
    const stats = computeReadingStats([
      b("1", true, "2013-01-01"), // year-only import
      b("2", true, "2013-01-01"),
      b("3", true, "2006-01-01"),
    ], NOW);
    expect(stats.perYear).toEqual([
      { year: 2006, count: 1 },
      { year: 2013, count: 2 },
    ]);
    expect(stats.bestYear).toEqual({ year: 2013, count: 2 });
  });

  it("separates total read from total dated (undated reads don't hit the timeline)", () => {
    const stats = computeReadingStats([
      b("1", true, "2025-03-03"),
      b("2", true), // read but no date
      b("3", false, "2025-01-01"), // dated but not marked read → ignored
    ], NOW);
    expect(stats.totalRead).toBe(2);
    expect(stats.totalDated).toBe(1);
    expect(stats.perYear).toEqual([{ year: 2025, count: 1 }]);
  });

  it("computes recent pace over the last 3 completed years (current year excluded)", () => {
    const stats = computeReadingStats([
      // completed years 2023,2024,2025 → (4+6+2)/3 = 4
      ...Array.from({ length: 4 }, (_, i) => b(`a${i}`, true, "2023-06-01")),
      ...Array.from({ length: 6 }, (_, i) => b(`c${i}`, true, "2024-06-01")),
      ...Array.from({ length: 2 }, (_, i) => b(`d${i}`, true, "2025-06-01")),
      b("now", true, "2026-06-01"), // current year excluded from pace
    ], NOW);
    expect(stats.recentPace).toBe(4);
    expect(stats.thisYear).toBe(1);
  });

  it("averages pace only over completed years since the first read (no pre-history dilution)", () => {
    // First dated read is 2025 → window is just [2025], not 2023..2025.
    const stats = computeReadingStats([
      ...Array.from({ length: 5 }, (_, i) => b(`x${i}`, true, "2025-06-01")),
    ], NOW);
    expect(stats.recentPace).toBe(5);
  });

  it("returns an empty, safe shape when nothing is dated", () => {
    const stats = computeReadingStats([b("1", true), b("2", false)], NOW);
    expect(stats).toEqual({
      perYear: [], totalRead: 1, totalDated: 0, thisYear: 0, lastYear: 0, bestYear: null, recentPace: 0,
      streaks: { current: 0, longest: 0, longestFrom: null, longestTo: null },
    });
  });

  describe("streaks", () => {
    it("counts the longest run of consecutive read-years", () => {
      // 2020,2021,2022 consecutive (3), gap, 2024,2025 (2). Longest = 3.
      const stats = computeReadingStats([
        b("1", true, "2020-06-01"), b("2", true, "2021-06-01"), b("3", true, "2022-06-01"),
        b("4", true, "2024-06-01"), b("5", true, "2025-06-01"),
      ], NOW);
      expect(stats.streaks.longest).toBe(3);
      expect(stats.streaks.longestFrom).toBe(2020);
      expect(stats.streaks.longestTo).toBe(2022);
    });

    it("reports a live current streak (reaches last year)", () => {
      // 2024,2025 consecutive, last year 2025 = currentYear-1 → live streak of 2.
      const stats = computeReadingStats([
        b("1", true, "2024-06-01"), b("2", true, "2025-06-01"),
      ], NOW);
      expect(stats.streaks.current).toBe(2);
    });

    it("current streak is 0 when the last read year is stale", () => {
      // Latest read 2023 < currentYear-1 (2025) → not live.
      const stats = computeReadingStats([
        b("1", true, "2022-06-01"), b("2", true, "2023-06-01"),
      ], NOW);
      expect(stats.streaks.current).toBe(0);
      expect(stats.streaks.longest).toBe(2);
    });

    it("a single dated year is a streak of 1 (not counted as a run in the UI)", () => {
      const stats = computeReadingStats([b("1", true, "2025-06-01")], NOW);
      expect(stats.streaks).toEqual({ current: 1, longest: 1, longestFrom: 2025, longestTo: 2025 });
    });
  });
});
