import { createLogger } from "../logger";
import { matchOfferToBook } from "./vintedMatch";

const log = createLogger("VintedParse");

export interface VintedItem {
  id?: string | number;
  title: string;
  price: string | number;
  /** Price as a number (for sorting). null when unknown (placeholder „Sprawdź"/„??"). */
  priceValue: number | null;
  currency: string;
  url: string;
  /** Offer thumbnail from the Vinted catalog (JSON path only — the HTML fallbacks don't have it). */
  photo?: string | null;
  /** Seller — fetched on-demand from the offer page (not present in the catalog). */
  seller?: VintedSeller | null;
}

export interface VintedSeller {
  /** Numeric profile ID (`/member/{id}`) — the grouping key. */
  id: string;
  /** Visible seller login. */
  login: string;
  /** Link to the profile. */
  url: string;
}

/**
 * Normalizes a raw Vinted price to a number: „15" → 15, „25,00" → 25, „12.90" → 12.9,
 * number → number. Placeholders („??", „Sprawdź", empty) and non-numeric values → null,
 * so offers without a price can be sorted to the end instead of breaking comparisons.
 */
/**
 * Detaches a string from its parent. V8 does NOT copy substrings: `str.match()`/`.split()` on
 * huge HTML (~7 MB) returns a SlicedString holding a pointer to the WHOLE parent.
 * When such a field lands in a long-lived array (the scanner's `results`), it pins the whole
 * HTML — after ~26 pages that's OOM (confirmed by Render logs). `Buffer.from(...)`
 * makes a standalone copy of the bytes, cutting the reference to the 7 MB parent. Offer fields
 * are short, so the copy cost is negligible.
 */
function detach(s: string): string {
  return Buffer.from(s, "utf8").toString("utf8");
}

export function parseVintedPrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure parser of Vinted catalog results (HTML → offers). No I/O or SSE events —
 * the scanner only supplies the raw HTML, title and author, and gets back up to 5 matched
 * offers. Four cascading paths: (1) JSON blob `data-component-name="Catalog"`,
 * (2) regex fallback `"items":[…]` with bracket closing, (3) `feed-grid__item`
 * blocks, (4) global regex `href=/items/…`. Extracted so this
 * fragile logic can be unit-tested on captured HTML.
 */
export interface VintedDebug {
  /** HTML response length (chars). Very small = possible block/challenge. */
  chars: number;
  /** Whether the page contains the catalog JSON blob (the „rich" path). */
  hasCatalogJson: boolean;
  /** Whether there are feed-grid blocks (the fallback path). */
  hasFeedGrid: boolean;
  /** How many /items/ links are in the HTML (offers exist, even if the parser didn't catch them). */
  itemLinks: number;
  /** Bot-block markers (cloudflare/captcha/robot). */
  blockedMarker: boolean;
  /** Vinted „no results" markers. */
  noResultsMarker: boolean;
  /** How many offers the parser actually extracted. */
  parsed: number;
}

// A real Vinted results page is megabytes of HTML. The Cloudflare challenge/block
// page is SMALL and carries a specific marker. The word „cloudflare"/
// „robot" alone appears in normal HTML (analytics, meta), so it was a false
// alarm on every page — hence we gate by size and the challenge phrase.
const CHALLENGE_RE = /just a moment|attention required|cf-mitigated|checking your browser|verify you are human|enable javascript and cookies|please complete the security check/i;

export function looksBlocked(html: string): boolean {
  const h = html || "";
  return h.length < 100_000 && CHALLENGE_RE.test(h);
}

/**
 * „No results" marker on the catalog page. NOTE: this is a naive substring in ~7 MB
 * of markup and is sometimes false on a page WITH offers — the caller then does NOT wipe
 * stored data (see vintedSyncService: persist only when there was nothing).
 */
export function looksEmpty(html: string): boolean {
  const h = html || "";
  return h.includes("Brak wyników") || h.includes("Nie znaleźliśmy żadnych przedmiotów");
}

// Offer tile in the catalog grid. Vinted hashes CSS-modules class names
// (`Grid-module-scss-module__HmDNda__feed-grid__item`), so we target the stable
// suffix `feed-grid__item"`. The trailing `"` cuts off the `feed-grid__item-content` variant.
const FEED_GRID_RE = /feed-grid__item"/;

/**
 * Lightweight diagnostics of a Vinted response (no I/O) — helps tell a genuine lack
 * of offers from a silent block or the parser dropping offers. `itemLinks > 0` with
 * `parsed === 0` and no markers = a strong signal the parser missed something.
 */
export function vintedDiagnostics(html: string, parsed: number): VintedDebug {
  const h = html || "";
  return {
    chars: h.length,
    hasCatalogJson: h.includes('data-component-name="Catalog"'),
    // Vinted hashes CSS-modules classes (e.g. `Grid-module-scss-module__…__feed-grid__item`),
    // so we match the stable suffix `feed-grid__item"`, not the whole class.
    hasFeedGrid: FEED_GRID_RE.test(h),
    itemLinks: (h.match(/\/items\//g) || []).length,
    blockedMarker: looksBlocked(h),
    noResultsMarker: h.includes("Brak wyników") || h.includes("Nie znaleźliśmy żadnych przedmiotów"),
    parsed,
  };
}

export function parseVintedItems(html: string, title: string, author: string): VintedItem[] {
  let rawItems: any[] = [];

  // Collect matches from every path, then rank strong (title+author) first and keep 5.
  // Gathering more than 5 first means a confident match isn't dropped just for sitting
  // past the cap in Vinted's (price) order.
  const collected: { item: VintedItem; strong: boolean }[] = [];
  const COLLECT_CAP = 24;
  const tryCollect = (offerTitle: string, build: () => VintedItem): boolean => {
    if (collected.length >= COLLECT_CAP) return false;
    const m = matchOfferToBook(offerTitle, title, author);
    if (!m.accept) return false;
    collected.push({ item: build(), strong: m.strong });
    return true;
  };

  // 1. JSON blob in the data-props attribute / Catalog script content
  const catalogMatch = html.match(/data-component-name="Catalog"[^>]*data-props="([^"]+)"/s) ||
                       html.match(/data-component-name="Catalog"[^>]*>\s*({.*?})\s*<\/script>/s);

  if (catalogMatch) {
    try {
      // HTML attributes use &quot; instead of "
      let jsonStr = catalogMatch[1];
      if (jsonStr.includes('&quot;')) {
        jsonStr = jsonStr.replace(/&quot;/g, '"')
                         .replace(/&amp;/g, '&')
                         .replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>')
                         .replace(/&#39;/g, "'");
      }
      const catalogData = JSON.parse(jsonStr);
      rawItems = catalogData.items?.list ||
                 catalogData.items ||
                 catalogData.catalog?.results?.items ||
                 catalogData.catalog?.items ||
                 [];
      log.info(`Znaleziono elementy w JSON`, { title, count: rawItems.length });
    } catch (e) {
      log.warn("Nie udało się sparsować JSON katalogu Vinted", { title });
    }
  }

  // 2. Fallback via the old "items" regex (with array-bracket closing)
  if (rawItems.length === 0) {
    const jsonMatch = html.match(/"items":\s*(\[.*?\])/);
    if (jsonMatch) {
      try {
        let bracketCount = 0;
        let endIndex = -1;
        const str = jsonMatch[1];
        for (let i = 0; i < str.length; i++) {
          if (str[i] === '[') bracketCount++;
          else if (str[i] === ']') {
            bracketCount--;
            if (bracketCount === 0) {
              endIndex = i + 1;
              break;
            }
          }
        }
        const jsonStr = endIndex !== -1 ? str.substring(0, endIndex) : str;
        rawItems = JSON.parse(jsonStr);
      } catch (e) {
        // The regex is sometimes too simple — never mind; move on to the HTML fallbacks
      }
    }
  }

  if (Array.isArray(rawItems)) {
    for (const item of rawItems) {
      if (collected.length >= COLLECT_CAP) break;
      const offerTitle = item.title || "";
      tryCollect(offerTitle, () => {
        const rawPrice = item.price?.amount || item.total_item_price?.amount || item.price?.amount_decimal || "??";
        const photo = item.photo?.url || item.photo?.thumbnails?.[0]?.url || item.photos?.[0]?.url || null;
        return {
          id: item.id,
          title: item.title || offerTitle,
          price: rawPrice,
          priceValue: parseVintedPrice(rawPrice),
          currency: item.price?.currency_code || item.currency || "PLN",
          url: item.url ? (item.url.startsWith('http') ? item.url : `https://www.vinted.pl${item.url}`) : `https://www.vinted.pl/items/${item.id}`,
          photo
        };
      });
    }
  }

  // 3. Fallback via feed-grid tiles (current Vinted DOM, hashed classes).
  // We split on `feed-grid__item"` — catches the old `class="feed-grid__item"` and the new
  // `class="Grid-module-scss-module__…__feed-grid__item"`. From each tile we take
  // the URL, title, structured price and thumbnail (`images1.vinted.net`).
  if (collected.length === 0) {
    const itemBlocks = html.split(FEED_GRID_RE);
    if (itemBlocks.length > 1) {
      for (let j = 1; j < itemBlocks.length && collected.length < COLLECT_CAP; j++) {
        const block = itemBlocks[j];
        // URL without query (`?referrer=catalog`) — consistent with the canonical offer link.
        const urlMatch = block.match(/href="(\/items\/[^"?]+)/);
        const titleMatch = block.match(/title="([^"]+)"/);
        // Both variants have group1 = amount, group2 = currency. The first hit
        // in a tile is the item price (the second = price with buyer protection).
        const priceMatch = block.match(/aria-label="[^"]*?(\d+[.,]\d+)\s*([A-Z]{3}|zł)"/i) ||
                           block.match(/>(\d+[.,]\d+)\s*([A-Z]{3}|zł)</i);
        const photoMatch = block.match(/<img[^>]+?src="(https?:\/\/[^"]*vinted\.net\/[^"]+)"/i);

        if (urlMatch && titleMatch) {
          const itemTitle = titleMatch[1];
          tryCollect(itemTitle, () => {
            const rawPrice = priceMatch ? priceMatch[1] : "Sprawdź";
            // detach: all these fields are substrings of the 7 MB HTML — without a copy they pin the parent.
            return {
              title: detach(itemTitle),
              url: detach(`https://www.vinted.pl${urlMatch[1]}`),
              price: detach(rawPrice),
              priceValue: parseVintedPrice(rawPrice),
              currency: priceMatch ? detach(priceMatch[2]) : "PLN",
              photo: photoMatch ? detach(photoMatch[1]) : null
            };
          });
        }
      }
    }
  }

  // 4. Last resort: a simple global regex
  if (collected.length === 0) {
    const itemRegex = /href="(\/items\/[^"]+)"[^>]*title="([^"]+)"/g;
    let match;
    while ((match = itemRegex.exec(html)) !== null && collected.length < COLLECT_CAP) {
      const itemUrl = `https://www.vinted.pl${match[1]}`;
      const itemTitle = match[2];
      // detach: itemTitle/itemUrl are substrings of the HTML — without a copy they pin the 7 MB parent.
      tryCollect(itemTitle, () => ({ title: detach(itemTitle), url: detach(itemUrl), price: "Sprawdź", priceValue: null, currency: "PLN" }));
    }
  }

  // Rank strong (title+author) matches first, keep the top 5. Array.sort is stable, so
  // within each group Vinted's original (price ascending) order is preserved.
  const items = [...collected]
    .sort((a, b) => (a.strong === b.strong ? 0 : a.strong ? -1 : 1))
    .slice(0, 5)
    .map((c) => c.item);

  // Last-ditch fallback for price: the HTML paths catch the listing's title attribute,
  // which Vinted builds as „Tytuł, Marka, Stan: …, {cena} zł, {cena z ochroną} zł".
  // When we lack a structured price, we extract it from that text (the lower of the two
  // = item price, the higher = with buyer protection).
  for (const item of items) {
    if (item.priceValue === null) {
      const fromText = extractPriceFromText(item.title);
      if (fromText !== null) {
        item.priceValue = fromText;
        item.price = String(fromText);
        item.currency = "zł";
      }
    }
  }

  return items;
}

/**
 * Extracts the seller from a single Vinted offer page (`/items/{id}`).
 * The seller is NOT in the catalog tiles — it appears only on the offer page.
 * Two stable, unique handles (verified on real HTML): the profile link
 * `/member/{id}` (ID) and `data-testid="profile-username"` (login). `detach` on
 * the login — the offer page is ~2 MB, a substring without a copy would pin it (as in the scan).
 */
export function extractVintedSeller(html: string): VintedSeller | null {
  const idMatch = html.match(/href="\/member\/(\d+)"/);
  if (!idMatch) return null;
  const id = idMatch[1];
  const loginMatch = html.match(/data-testid="profile-username">\s*([^<]+?)\s*<\/span>/);
  const login = loginMatch ? detach(loginMatch[1]) : `user-${id}`;
  return { id, login, url: `https://www.vinted.pl/member/${id}` };
}

/**
 * Extracts the lowest amount „NN[.,]NN zł/PLN" from text (e.g. from an offer's title
 * attribute). Returns the item price (the lower of the price/total pair) or null.
 */
export function extractPriceFromText(text: string): number | null {
  if (!text) return null;
  // Note: no \b after „zł" — „ł" is a non-word character, so the word boundary doesn't hold.
  const re = /(\d+(?:[.,]\d+)?)\s*(?:zł|PLN)/gi;
  const values: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = parseVintedPrice(m[1]);
    if (v !== null) values.push(v);
  }
  return values.length ? Math.min(...values) : null;
}
