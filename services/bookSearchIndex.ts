import { NotionBook, BookIndexEntry } from "../src/types";
import { isAwardBook } from "./bookCategory";
import { isbn13to10 } from "./isbn";

/** Space-joined ISBN forms for text search: each stored ISBN-13 plus its ISBN-10 equivalent (pre-2007). */
function buildIsbnSearch(isbns?: string[]): string | undefined {
  if (!isbns || isbns.length === 0) return undefined;
  const forms = new Set<string>();
  for (const i of isbns) {
    forms.add(i);
    const ten = isbn13to10(i);
    if (ten) forms.add(ten);
  }
  return Array.from(forms).join(" ");
}

/**
 * Pure projection of full Notion records → a slimmed-down search index.
 * Cuts heavy fields (`vintedData` blob, `*RichText`), keeps only what
 * „Katalog" filters/renders on. Keeps a record having ANY
 * title — Polish OR original; untranslated books (original title only)
 * should be searchable too. Only a record with no title at all is dropped (a skeleton).
 *
 * `awardOnly` (default true): the Regał shelf stays award-only (side cycle volumes have
 * their own „Archiwum Cykli" view). Pass `false` for the barcode scan / full Katalog
 * search, so a scan can find a tracked cycle volume too.
 */
export function toSearchIndex(books: NotionBook[], awardOnly = true): BookIndexEntry[] {
  return books
    .filter((b) => !awardOnly || isAwardBook(b))
    .filter((b) => (b.plTitle && b.plTitle.trim().length > 0) || (b.origTitle && b.origTitle.trim().length > 0))
    .map((b) => ({
      id: b.id,
      plTitle: b.plTitle,
      origTitle: b.origTitle || "",
      author: b.author || "",
      year: b.year || "",
      awards: b.awards || [],
      zrodlo: b.zrodlo || [],
      series: b.currentSeria || "",
      partOfCycle: b.currentCzesccyklu ?? false,
      shelfOrder: b.shelfOrder,
      dataPrzeczytania: b.dataPrzeczytania,
      isbns: b.isbns,
      isbnSearch: buildIsbnSearch(b.isbns),
    }));
}
