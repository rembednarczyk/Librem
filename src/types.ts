export interface Book {
  year: string;
  author: string;
  polishTitle: string;
  originalTitle: string;
  polishTitleLink: string | null;
  award: string;
  awards?: string[];
}

export interface NotionRichTextItem {
  plain_text: string;
  href?: string | null;
  text?: { content: string; link?: { url: string } | null };
}

export interface NotionProperty {
  id?: string;
  type?: string;
  title?: NotionRichTextItem[];
  rich_text?: NotionRichTextItem[];
  number?: number;
  select?: { name: string; color?: string } | null;
  multi_select?: { name: string; color?: string }[];
  checkbox?: boolean;
  url?: string | null;
  date?: { start: string; end?: string | null } | null;
  name?: string;
}

export interface NotionPageProperties {
  [key: string]: NotionProperty;
}

export interface NotionPage {
  id: string;
  properties: NotionPageProperties;
}

export interface NotionBook {
  id: string;
  plTitle: string;
  origTitle: string;
  awards: string[];
  year?: string;
  author?: string;
  currentWydawnictwo?: string;
  currentSeria?: string;
  currentCzesccyklu?: boolean;
  /** Row category: „Nagroda" (default/empty) vs „Tom cyklu" (sibling cycle volume). */
  kategoria?: string;
  lp?: string;
  zrodlo?: string[];
  /** Calendar day the book was marked „Przeczytane" (column „Data przeczytania", date; „YYYY-MM-DD").
   *  Stamped on mark-as-read, cleared on unmark. Undefined = never read / not yet captured. */
  dataPrzeczytania?: string;
  plTitleRichText?: NotionRichTextItem[];
  origTitleRichText?: NotionRichTextItem[];
  /** JSON blob of stored Vinted results (field „VintedData") — parsed by vintedStore. */
  vintedData?: string;
  /** Cycle name (field „Cykl") — groups the rows of one cycle (anchor + sibling volumes). */
  cykl?: string;
  /** Position within the cycle (field „CyklNr", number) — reading order. */
  cyklNr?: number;
  /** Manual shelf ordering key (column „ShelfOrder"; fractional-year scale). */
  shelfOrder?: number;
  /** Canonical ISBN-13s across editions (column „ISBN") — filled by the enrichment ritual; ANY of them matches a barcode. */
  isbns?: string[];
}

/**
 * Slimmed-down book record for the „Katalog" search (`GET /api/books`).
 * Deliberately WITHOUT heavy fields (`vintedData` blob, `*RichText`) — this is an
 * index for client-side filtering, not the full model. Shared by server and front.
 */
export interface BookIndexEntry {
  id: string;
  plTitle: string;
  origTitle: string;
  author: string;
  year: string;
  awards: string[];
  zrodlo: string[];
  series: string;
  partOfCycle: boolean;
  /** Manual shelf ordering key (precise drag&drop); absent → sort by year. */
  shelfOrder?: number;
  /** „Data przeczytania" ISO („YYYY-MM-DD") — surfaced on the card/shelf; Jan-1 = year-only. */
  dataPrzeczytania?: string;
  /** Canonical ISBN-13s across editions (if enriched) — a barcode of ANY edition matches this row. */
  isbns?: string[];
  /** Space-joined ISBN forms for text search: each ISBN-13 plus its ISBN-10 equivalent (old, pre-2007). */
  isbnSearch?: string;
}

export interface SyncState {
  loading: boolean;
  result: any | null;
  error: string | null;
  statusMessage: string | null;
  progress: { current: number; total: number } | null;
  startTime: number | null;
  awardName?: string;
  pageTitle?: string;
  isSyncAll?: boolean;
  color?: string;
}

export interface SyncEvent {
  // "match" / "search_attempt" are emitted by the scanners (Vinted/Biblioteka)
  // "seller_resolved" — Vinted grouping per seller (resolving the offer's seller)
  type: "status" | "progress" | "complete" | "error" | "match" | "search_attempt" | "seller_resolved";
  message?: string;
  error?: string;
  current?: number;
  total?: number;
  result?: any;
}

export interface SyncParams {
  awardName?: string;
  pageTitle?: string;
  syncAll?: boolean;
}

export interface IntegrityCheckResult {
  lpUniqueness: { status: boolean; duplicates: string[] };
  yearCountMatch: { 
    status: boolean; 
    diffs: { 
      year: string; 
      notion: number; 
      wiki: number;
      notionOnly?: string[];
      wikiOnly?: string[];
      misplaced?: { title: string, otherYear: string }[];
      collisions?: { title: string, matches: string[] }[];
    }[] 
  };
  originalTitleUniqueness: { status: boolean; duplicates: string[] };
  polishTitleUniqueness: { status: boolean; duplicates: string[] };
  awardCountMatch: {
    status: boolean;
    diffs: {
      award: string;
      notion: number;
      wiki: number;
      notionOnly?: string[];
      wikiOnly?: string[];
    }[]
  };
}
