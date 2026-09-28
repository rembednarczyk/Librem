/**
 * Domain types for the stats/library feature. Extracted from `useStats` so hooks
 * and components import them from here instead of reaching into the stats-hook
 * module (which had become a de-facto types barrel).
 */

export interface AuthorStat {
  name: string;
  read: number;
  total: number;
  books: { id: string; title: string; year?: number | null; read: boolean }[];
}

export interface AwardCoverageStat {
  name: string;
  count: number;
  total: number;
}

export interface YearlyStat {
  year: string;
  read: number;
  total: number;
  books: { id: string; title: string; author: string; read: boolean }[];
}

export interface LibraryStat {
  id: string;
  name: string;
  books: { id: string; title: string; author: string; year?: number | null; read: boolean }[];
}

export interface IdentifiedBook {
  id: string;
  title: string;
  author: string;
  year?: number | null;
  // Filled by the library scan (OPAC) — title/author read from the catalog
  extractedTitle?: string | null;
  extractedAuthor?: string | null;
}

/** Aggregated availability of unread items — priority partition (each book once). */
export interface AvailabilityStats {
  totalUnread: number;
  /** Owned but unread. */
  owned: number;
  /** Available to borrow from the library (branch tag), not owned. */
  library: number;
  /** Available on Vinted (≥1 stored offer), not owned and not in the library. */
  vinted: number;
  /** No trace — not owned, no library, no offers. */
  none: number;
}

export interface ReadingYearCount { year: number; count: number }
/** Reading pace over award books, by the year each was marked read. Year-granular
 *  on purpose (historical dates are often year-only). */
export interface ReadingStats {
  /** Books read per calendar year (ascending; only years with ≥1 read). */
  perYear: ReadingYearCount[];
  /** Award books marked read (with or without a date). */
  totalRead: number;
  /** Of those, how many carry a „Data przeczytania". */
  totalDated: number;
  /** Reads in the current / previous calendar year. */
  thisYear: number;
  lastYear: number;
  /** Peak reading year (earliest on a tie), or null when nothing is dated. */
  bestYear: ReadingYearCount | null;
  /** Mean books/year over completed years since you started (last 3, current excluded). */
  recentPace: number;
  /** Reading streaks over consecutive read-years. */
  streaks: ReadingStreaks;
}

export interface ReadingStreaks {
  /** Consecutive read-years ending at a still-live year (current or previous); else 0. */
  current: number;
  /** Longest run of consecutive years each with ≥1 read. */
  longest: number;
  longestFrom: number | null;
  longestTo: number | null;
}

export interface PublisherStat { name: string; count: number; read: number }
export interface SeriesStat { name: string; count: number; owned: number; read: number }
export interface CycleStats { partOfCycle: number; standalone: number; total: number }
export interface DecadeStat { decade: number; total: number; read: number; owned: number }

export interface CheapOffer { bookId: string; bookTitle: string; price: number; currency: string; url: string }
export interface PriceDrop extends CheapOffer { prevPrice: number }
export interface TopSeller { id: string; login: string; url: string; books: number; total: number }
export interface MarketStats {
  currency: string;
  completionCost: number;
  booksWithOffers: number;
  totalOffers: number;
  cheapest: CheapOffer[];
  priceDrops: PriceDrop[];
  topSellers: TopSeller[];
}

export interface Stats {
  authorStats: AuthorStat[];
  awardBooksStats: { read: number; total: number };
  ownedUnread: { id: string; title: string; author: string; year?: number | null }[];
  awardCoverage: AwardCoverageStat[];
  allAwardsStats: { read: number; total: number };
  yearlyStats: YearlyStat[];
  availabilityStats: AvailabilityStats;
  publisherStats: PublisherStat[];
  seriesStats: SeriesStat[];
  cycleStats: CycleStats;
  decadeStats: DecadeStat[];
  readingStats: ReadingStats;
  marketStats: MarketStats;
  libraryStats: LibraryStat[];
}

export interface IdentifiedBooks {
  [libraryId: string]: IdentifiedBook[];
}
