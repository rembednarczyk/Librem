import { useState, useEffect, useCallback } from "react";
import { useReadStateListener } from "../contexts/ReadStateContext";

export type {
  AuthorStat, AwardCoverageStat, YearlyStat, LibraryStat, IdentifiedBook, AvailabilityStats,
  PublisherStat, SeriesStat, CycleStats, DecadeStat, ReadingYearCount, ReadingStats,
  CheapOffer, PriceDrop, TopSeller, MarketStats,
  Stats, IdentifiedBooks,
} from "../types/stats";
import type { Stats } from "../types/stats";

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats?t=${Date.now()}`);
      if (!res.ok) throw new Error("Błąd podczas pobierania statystyk");
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Optimistically add a book to the „Książki dostępne w bibliotekach" section
  // right after tagging (Biblioteka / Biblioteka 9), without waiting for the next
  // refetch — Notion can lag on reads just after a write, so a full refresh may
  // not see the new tag yet. `libraryStats[].id` is the tag name, so we match the
  // branch by its tag.
  const addBookToLibrarySection = useCallback((tag: string, book: { id: string; title: string; author: string; year?: number | null }) => {
    setStats(prev => {
      if (!prev) return prev;
      const libraryStats = prev.libraryStats.map(ls => {
        if (ls.id !== tag || ls.books.some(b => b.id === book.id)) return ls;
        return { ...ls, books: [...ls.books, { ...book, read: false }] };
      });
      return { ...prev, libraryStats };
    });
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // A mark („Przeczytane"/„Posiadam") from any widget — even another card in this
  // same tab, like „Cykle" — refreshes the derived stats (KPI, tempo, posiadane).
  useReadStateListener(fetchStats);

  return { stats, loading, error, fetchStats, addBookToLibrarySection };
}
