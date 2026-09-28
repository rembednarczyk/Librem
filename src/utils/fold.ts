/**
 * Per-CHARACTER diacritic fold (not NFD): maps Polish letters to their Latin
 * equivalents and lowercases. We deliberately do NOT use `normalize('NFD')` —
 * NFD doesn't decompose „ł" (U+0142), whereas a per-character fold is 1:1 in
 * length, so hit indices map straight onto the original text (highlighting).
 *
 * Shared by the catalog search (`bookSearch`) and the Vinted offer matcher
 * (`services/vintedMatch`) — Vinted listings routinely drop Polish diacritics
 * („czarne slonce"), so both sides must fold before comparing.
 */
const FOLD: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ż: "z", ź: "z",
};

export function fold(s: string): string {
  let out = "";
  for (const ch of s.toLowerCase()) out += FOLD[ch] ?? ch;
  return out;
}
