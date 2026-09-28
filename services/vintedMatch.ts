import { fold } from "../src/utils/fold";

/**
 * Does a Vinted offer's listing name actually refer to THIS book?
 *
 * The old rule was `offerTitle.includes(bookTitle) || bookTitle.includes(offerTitle)
 * || offerTitle.includes(author)` — too loose, and the source of the „ślepe strzały":
 *  - accepting on the AUTHOR alone matched every other book by the same author;
 *  - `bookTitle.includes(offerTitle)` let a short generic listing name („Słońce") match
 *    a longer book title („Czarne słońce");
 *  - plain substring ignored word boundaries, so „sun" matched „sunday".
 *
 * New rule: the offer name must contain the WHOLE book title as consecutive whole
 * words (diacritics folded, punctuation flattened, word-boundary guarded). The author
 * is corroboration — a title+author hit is `strong` and surfaces first — but is NEVER
 * enough on its own. A listing that only carries the title still matches (that's the
 * common case), so recall for real offers is kept while the wrong-book noise is cut.
 */

/** Fold diacritics, lowercase, flatten every non-alphanumeric run to a single space. */
export function normalizeForMatch(s: string): string {
  return fold(s || "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Whole-word containment: `needle` appears in `hay` on word boundaries (space-padded). */
function containsWords(hayNorm: string, needleNorm: string): boolean {
  if (!needleNorm) return false;
  return ` ${hayNorm} `.includes(` ${needleNorm} `);
}

export interface OfferMatch {
  /** Keep this offer — the book title is present as whole words. */
  accept: boolean;
  /** Title AND author both present — the confident match (surfaced first). */
  strong: boolean;
}

export function matchOfferToBook(offerTitle: string, bookTitle: string, author: string): OfferMatch {
  const offer = normalizeForMatch(offerTitle);
  const title = normalizeForMatch(bookTitle);
  if (!offer || !title) return { accept: false, strong: false };

  const titleHit = containsWords(offer, title);
  // Any author token that's a real word (≥3 chars) — usually the surname carries it.
  const authorHit = normalizeForMatch(author)
    .split(" ")
    .filter((t) => t.length >= 3)
    .some((t) => containsWords(offer, t));

  return { accept: titleHit, strong: titleHit && authorHit };
}
