import { NotionAdapter } from "../notion.adapter";
import { WikiAdapter } from "../wiki.adapter";
import { WikiParser } from "../wiki.parser";
import { NotionBook } from "../src/types";
import { isWikiAuthorMatch } from "./dataNormalizer";
import { createLogger } from "../logger";
import { BoundedCache } from "./boundedCache";

const log = createLogger("CycleLookup");

/** Status of a single volume relative to YOUR database (cross-ref by normalized title). */
export interface CycleVolume {
  title: string;
  /** Whether this is the book the preview started from. */
  isCurrent: boolean;
  /** Whether the volume is in the Notion database. */
  inBase: boolean;
  read: boolean;
  owned: boolean;
  /** Whether the volume is awarded (has any award in the database). */
  awarded: boolean;
  awards: string[];
}

export interface CycleView {
  cycleName: string;
  volumes: CycleVolume[];
  /** How many volumes BEFORE the current one are unread (books to catch up on before the plot). */
  unreadBefore: number;
  /** List source: „chain" (prev/next), „template" ({{Cykl}}), „mixed". */
  source: "chain" | "template" | "mixed" | "single";
}

/** Title normalization for cross-referencing: no wiki formatting, lowercase, no edge punctuation.
 *  Exported so the harvest ritual indexes rows EXACTLY the same way (otherwise „inBase" from
 *  lookup and the match in harvest diverge → duplicate row). */
export function normTitle(t: string): string {
  return (t || "")
    .replace(/''+/g, "")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .toLowerCase()
    .replace(/[.,:;!?'"„”»«()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_HOPS = 15;         // default cap per direction — the on-demand PREVIEW (fast).
export const HARVEST_MAX_HOPS = 40; // Żniwa want full COVERAGE, so they walk far more of
                                    // the chain before MAX_HOPS truncates it (backlog residuum).

/**
 * Cycle preview for a single book — ON DEMAND, without writing to Notion.
 * Builds an ordered list of volumes from the `|poprzednia=`/`|następna=` chain (a solid,
 * confirmed format), enriches it with links from `{{Cykl}}`, and cross-refs each volume with the database.
 * In-process memory cache (key: title+author) — a repeat click is instant.
 */
export class CycleLookupService {
  // Bounded: the key comes from `?title=`/`?author=`, so an unbounded Map would grow
  // with every distinct request — and each miss costs up to ~34 wiki fetches.
  private cache = new BoundedCache<CycleView | null>(500);

  constructor(private notion: NotionAdapter, private wiki: WikiAdapter) {}

  /** Resolves the wiki page for (title, author): direct fetch + search, with an author gate. */
  private async resolvePage(title: string, author: string): Promise<string> {
    // 1. Direct fetch by exact title.
    const direct = await this.wiki.fetchPageContent(title);
    if (direct && (!author || isWikiAuthorMatch(WikiParser.extractAuthor(direct), author))) return direct;
    // 2. Search by „tytuł autor".
    if (author) {
      const hits = await this.wiki.searchPage(`${title} ${author}`, 3);
      for (const h of hits) {
        const c = await this.wiki.fetchPageContent(h);
        if (c && isWikiAuthorMatch(WikiParser.extractAuthor(c), author)) return c;
      }
    }
    return direct || "";
  }

  /** Fetch by the exact title of a chain neighbor (no author gate — title from a trusted field). */
  private async fetchNeighbor(title: string): Promise<string> {
    try { return await this.wiki.fetchPageContent(title); } catch { return ""; }
  }

  /** `maxHops` (default = preview cap) — Żniwa pass a larger value for fuller coverage. */
  async lookup(rawTitle: string, author: string, maxHops: number = MAX_HOPS): Promise<CycleView | null> {
    const key = `${normTitle(rawTitle)}|${(author || "").toLowerCase().trim()}|${maxHops}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const result = await this.compute(rawTitle, author, maxHops);
    this.cache.set(key, result);
    return result;
  }

  private async compute(rawTitle: string, author: string, maxHops: number): Promise<CycleView | null> {
    const wikitext = await this.resolvePage(rawTitle, author);
    if (!wikitext) return null;
    const info = WikiParser.extractCycleInfo(wikitext);
    if (!info.cycleName && !info.prev && !info.next && info.templateVolumes.length === 0) return null;

    // Ordered chain: ...prev(prev), prev, [current], next, next(next)...
    const before: string[] = [];
    const after: string[] = [];
    const visited = new Set<string>([normTitle(rawTitle)]);

    let cursor = info.prev;
    for (let i = 0; i < maxHops && cursor; i++) {
      const n = normTitle(cursor);
      if (visited.has(n)) break;
      visited.add(n);
      before.unshift(cursor);
      const c = await this.fetchNeighbor(cursor);
      cursor = c ? WikiParser.extractCycleInfo(c).prev : null;
    }
    cursor = info.next;
    for (let i = 0; i < maxHops && cursor; i++) {
      const n = normTitle(cursor);
      if (visited.has(n)) break;
      visited.add(n);
      after.push(cursor);
      const c = await this.fetchNeighbor(cursor);
      cursor = c ? WikiParser.extractCycleInfo(c).next : null;
    }

    const chain = [...before, rawTitle, ...after];
    // Links from {{Cykl}} — add ones absent from the chain (for cycles without prev/next).
    const extras = info.templateVolumes.filter((t) => !chain.some((c) => normTitle(c) === normTitle(t)));
    const ordered = chain.length > 1 ? [...chain, ...extras] : (extras.length > 0 ? [rawTitle, ...extras] : chain);

    const source: CycleView["source"] =
      chain.length > 1 && extras.length > 0 ? "mixed" :
      chain.length > 1 ? "chain" :
      extras.length > 0 ? "template" : "single";

    // Cross-referencing with the database (cache: shared fetch).
    const books = await this.notion.getBooksForStats(undefined, undefined, { cache: true });
    const byTitle = new Map<string, NotionBook>();
    for (const b of books) {
      for (const t of [b.plTitle, b.origTitle]) if (t) byTitle.set(normTitle(t), b);
    }

    const volumes: CycleVolume[] = ordered.map((title) => {
      const b = byTitle.get(normTitle(title));
      const zr = b?.zrodlo || [];
      return {
        title,
        isCurrent: normTitle(title) === normTitle(rawTitle),
        inBase: !!b,
        read: zr.includes("Przeczytane"),
        owned: zr.includes("Posiadam"),
        awarded: (b?.awards || []).length > 0,
        awards: b?.awards || [],
      };
    });

    const currentIdx = volumes.findIndex((v) => v.isCurrent);
    const unreadBefore = currentIdx > 0 ? volumes.slice(0, currentIdx).filter((v) => !v.read).length : 0;

    // Cycle name: the |cykl= field if present; otherwise NOT „Cykl" (all nameless
    // cycles would collapse into one group and most would be skipped in the harvest) —
    // we take the title of the FIRST volume, stable regardless of the starting anchor.
    const cycleName = info.cycleName || volumes[0]?.title || "Cykl";
    log.info("Cykl", { title: rawTitle, cycle: cycleName, volumes: volumes.length, source });
    return { cycleName, volumes, unreadBefore, source };
  }
}
