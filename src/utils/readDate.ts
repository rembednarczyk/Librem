/**
 * Formats a stored „Data przeczytania" ISO string („YYYY-MM-DD") for display.
 *
 * The granularity is deliberately year-level for much of the history: year-only
 * reads (imported when only the year was known) are stored as Jan 1, so a Jan-1
 * date is NOT a real 1 January read — we show just the YEAR for it. A date with a
 * real month/day is shown in full („DD.MM.YYYY", Polish). Malformed / empty → "".
 */
export function formatReadDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return "";
  const [, y, mo, d] = m;
  // Jan 1 = the year-only workaround → show the year alone (don't invent a day).
  if (mo === "01" && d === "01") return y;
  return `${d}.${mo}.${y}`;
}
