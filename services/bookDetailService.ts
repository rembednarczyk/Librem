import { WikiAdapter } from "../wiki.adapter";
import { WikiParser, BookEdition } from "../wiki.parser";
import { isWikiAuthorMatch } from "./dataNormalizer";
import { normalizeIsbn, isbn10to13 } from "./isbn";
import { createLogger } from "../logger";
import { BoundedCache } from "./boundedCache";

const log = createLogger("BookDetail");

export interface BookDetail {
  /** The resolved wiki page title (may differ slightly from the query). */
  title: string;
  /** Direct cover-image URL on the encyclopedia, or "" when there's none. */
  coverUrl: string;
  /** Year label of the edition whose cover is shown (e.g. „2025"), or "". */
  editionYear: string;
  /** How many editions the page lists (0 when there's no editions table). */
  editionsCount: number;
  /** Why this cover was picked: newest edition, an ISBN match, or the infobox fallback. */
  coverSource: "newest" | "isbn-match" | "infobox";
  /** Free-text blurb from the page, cleaned + capped, or "". */
  description: string;
  translator: string;
  publisher: string;
  coverArtist: string;
  firstPolish: string;
}

/** Unify an ISBN to its 13-digit canonical form for comparison (10→13), or null. */
function isbnKey(raw: string): string | null {
  const n = normalizeIsbn(raw);
  if (!n) return null;
  return n.length === 10 ? isbn10to13(n) : n;
}

/**
 * On-demand book-detail preview for a single catalog entry — reads the encyclopedia
 * page, then picks a cover: the edition matching a scanned `isbn` when given, else the
 * NEWEST edition's cover, else the infobox `|grafika|`. Also pulls the blurb + edition
 * fields. NO DB writes. Mirrors `CycleLookupService`: author-gated page resolution +
 * an in-process bounded cache. At most 2 wiki calls (page + imageinfo).
 */
export class BookDetailService {
  private cache = new BoundedCache<BookDetail | null>(500);

  constructor(private wiki: WikiAdapter) {}

  /** Resolve the wiki page for (title, author): direct fetch, then a gated search. */
  private async resolvePage(title: string, author: string): Promise<string> {
    const direct = await this.wiki.fetchPageContent(title);
    if (direct && (!author || isWikiAuthorMatch(WikiParser.extractAuthor(direct), author))) return direct;
    if (author) {
      const hits = await this.wiki.searchPage(`${title} ${author}`, 3);
      for (const h of hits) {
        const c = await this.wiki.fetchPageContent(h);
        if (c && isWikiAuthorMatch(WikiParser.extractAuthor(c), author)) return c;
      }
    }
    return direct || "";
  }

  /** `isbn` (optional): when given, prefer the edition whose ISBN matches it. */
  async lookup(rawTitle: string, author: string, isbn?: string): Promise<BookDetail | null> {
    const isbnK = isbn ? isbnKey(isbn) : null;
    const key = `${(rawTitle || "").toLowerCase().trim()}|${(author || "").toLowerCase().trim()}|${isbnK || ""}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const result = await this.compute(rawTitle, author, isbnK);
    this.cache.set(key, result);
    return result;
  }

  private async compute(rawTitle: string, author: string, isbnK: string | null): Promise<BookDetail | null> {
    const wikitext = await this.resolvePage(rawTitle, author);
    if (!wikitext) return null;

    const info = WikiParser.extractBookInfobox(wikitext);
    const editions = WikiParser.extractEditions(wikitext);
    if (!info.coverFile && !info.description && editions.length === 0 && !info.translator && !info.publisher) return null;

    // Pick the edition to show: an ISBN match wins; otherwise the newest with a cover.
    let chosen: BookEdition | undefined;
    let coverSource: BookDetail["coverSource"] = "infobox";
    if (isbnK) chosen = editions.find((e) => isbnKey(e.isbn) === isbnK && e.coverFile);
    if (chosen) {
      coverSource = "isbn-match";
    } else {
      const withCover = editions.filter((e) => e.coverFile && e.year != null);
      chosen = withCover.sort((a, b) => (b.year! - a.year!))[0];
      if (chosen) coverSource = "newest";
    }

    const coverFile = chosen?.coverFile || info.coverFile;
    const coverUrl = coverFile ? await this.wiki.resolveImageUrl(coverFile) : "";

    log.info("Szczegóły książki", { title: rawTitle, cover: coverSource, editions: editions.length, hasCover: !!coverUrl });
    return {
      title: rawTitle,
      coverUrl,
      editionYear: chosen?.yearLabel || "",
      editionsCount: editions.length,
      coverSource,
      description: info.description,
      // Prefer the chosen edition's fields; fall back to the infobox's.
      translator: chosen?.translator || info.translator,
      publisher: chosen?.publisher || info.publisher,
      coverArtist: chosen?.coverArtist || info.coverArtist,
      firstPolish: info.firstPolish,
    };
  }
}
