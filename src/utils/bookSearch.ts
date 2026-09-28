import { BookIndexEntry } from "../types";
import { fold } from "./fold";

export { fold };

/** Splits the query into tokens (on spaces) after folding. */
function tokenize(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/**
 * Filters + ranks the index by title (PL + original) and author. Each token
 * must match (AND) as a substring in ANY of the fields — so that „simmons
 * hyperion" combines author with title. Empty query → whole set (browse mode).
 * Ranking: title prefix > title substring > original title > author.
 */
export function matchBooks(query: string, index: BookIndexEntry[]): BookIndexEntry[] {
  const tokens = tokenize(query);
  // Effective title = Polish, and when missing — original (untranslated records).
  const displayTitle = (b: BookIndexEntry) => b.plTitle || b.origTitle;
  const byTitle = (a: BookIndexEntry, b: BookIndexEntry) => displayTitle(a).localeCompare(displayTitle(b), "pl");

  if (!tokens.length) return [...index].sort(byTitle);

  const scored: { book: BookIndexEntry; score: number }[] = [];
  for (const b of index) {
    const title = fold(displayTitle(b));
    const orig = fold(b.origTitle);
    const author = fold(b.author);
    // The book's ISBN forms (ISBN-13 + old ISBN-10) for full/partial ISBN search.
    const isbnForms = (b.isbnSearch || "").toLowerCase().split(/\s+/).filter(Boolean);
    const matchesAll = tokens.every((t) => {
      if (title.includes(t) || orig.includes(t) || author.includes(t)) return true;
      // A numeric token of ≥4 digits may be a (partial) ISBN. Match it as a PREFIX of an
      // ISBN (how people read/type ISBNs, left to right) — NOT any substring, so a common
      // number like a year „1984" doesn't hit every ISBN that merely contains it. A long
      // fragment (≥8 digits, can't be a year) may also match mid-ISBN.
      const digits = t.replace(/[^0-9x]/g, "");
      if (digits.length < 4) return false;
      return isbnForms.some((f) => f.startsWith(digits) || (digits.length >= 8 && f.includes(digits)));
    });
    if (!matchesAll) continue;

    const t0 = tokens[0];
    const score = title.startsWith(t0) ? 0
      : title.includes(t0) ? 1
      : orig.includes(t0) ? 2
      : 3;
    scored.push({ book: b, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || byTitle(a.book, b.book))
    .map((s) => s.book);
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/**
 * Splits text into hit/non-hit segments relative to the query. Relies on the
 * 1:1 fold (index in folded == index in original), so it highlights in the
 * right place despite diacritics. Highlights only tokens present in THIS
 * text (a token matched in another field yields no range here).
 */
export function highlight(text: string, query: string): HighlightSegment[] {
  const tokens = tokenize(query);
  if (!tokens.length || !text) return [{ text, hit: false }];

  const folded = fold(text);
  // Safeguard: if lowercase changed the length (rare unicode), fall back to
  // no highlighting instead of misaligned indices.
  if (folded.length !== text.length) return [{ text, hit: false }];

  const ranges: [number, number][] = [];
  for (const t of tokens) {
    let from = 0;
    let i = folded.indexOf(t, from);
    while (i !== -1) {
      ranges.push([i, i + t.length]);
      from = i + t.length;
      i = folded.indexOf(t, from);
    }
  }
  if (!ranges.length) return [{ text, hit: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  const segs: HighlightSegment[] = [];
  let cur = 0;
  for (const [s, e] of merged) {
    if (s > cur) segs.push({ text: text.slice(cur, s), hit: false });
    segs.push({ text: text.slice(s, e), hit: true });
    cur = e;
  }
  if (cur < text.length) segs.push({ text: text.slice(cur), hit: false });
  return segs;
}

// ── „Czy chodziło Ci o…" — fuzzy suggestions for typos ──────────────────

export interface VocabTerm {
  /** Normalized (folded) word — distance is computed against this. */
  folded: string;
  /** Variant to show the user (original spelling). */
  display: string;
}

/** Words (≥3 chars) from the text, split on non-letter/digit boundaries. */
function wordsOf(s: string): string[] {
  return s.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
}

/**
 * Builds a term dictionary (words from PL+orig titles and authors) for fuzzy
 * suggestions. Dedupes by fold; prefers the capitalized variant as `display`.
 * Computed once per set (memoized in the component), not on every keystroke.
 */
export function buildSearchVocab(index: BookIndexEntry[]): VocabTerm[] {
  const map = new Map<string, string>();
  const hasUpper = (w: string) => w !== w.toLowerCase();
  const add = (s: string) => {
    for (const w of wordsOf(s)) {
      const f = fold(w);
      if (f.length < 3) continue;
      const prev = map.get(f);
      if (!prev || (hasUpper(w) && !hasUpper(prev))) map.set(f, w);
    }
  };
  for (const b of index) {
    add(b.plTitle);
    add(b.origTitle);
    add(b.author);
  }
  return [...map.entries()].map(([folded, display]) => ({ folded, display }));
}

/** Levenshtein distance (two row buffers — O(min·max) linear memory). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/**
 * „Czy chodziło Ci o…" — for a (usually zero-hit) query returns up to `limit`
 * of the closest dictionary terms. Compares the LAST query token (where the
 * typo usually sits), with a threshold that depends on length. Pre-filtering
 * by length difference (Levenshtein ≥ |Δlen|) cuts the cost. Skips exact hits.
 */
export function didYouMean(query: string, vocab: VocabTerm[], limit = 3): string[] {
  const qWord = fold(query).split(/\s+/).filter(Boolean).pop() ?? "";
  if (qWord.length < 3) return [];
  const maxDist = qWord.length <= 4 ? 1 : qWord.length <= 7 ? 2 : 3;

  const scored: { display: string; dist: number; len: number; folded: string }[] = [];
  for (const v of vocab) {
    if (Math.abs(v.folded.length - qWord.length) > maxDist) continue;
    if (v.folded === qWord) continue;
    const d = levenshtein(qWord, v.folded);
    if (d <= maxDist) scored.push({ display: v.display, dist: d, len: v.folded.length, folded: v.folded });
  }
  scored.sort((a, b) => a.dist - b.dist || a.len - b.len || a.display.localeCompare(b.display, "pl"));

  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    const key = s.display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.display);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Replaces the LAST query token with `term`, keeping the earlier words —
 * because `didYouMean` corrects exactly the last token. „Greg Vear" + „Bear" →
 * „Greg Bear". Empty / only spaces → returns just `term`.
 */
export function replaceLastToken(query: string, term: string): string {
  const m = query.match(/^(.*?)(\S+)\s*$/);
  if (!m) return term;
  return `${m[1]}${term}`;
}
