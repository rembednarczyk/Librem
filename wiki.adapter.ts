import axios from "axios";
import http from "http";
import https from "https";
import { withRetry } from "./retry";
import { createLogger, classifyHttpError, ErrorClass } from "./logger";

const log = createLogger("WikiAdapter");

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

/** The encyclopedia's MediaWiki API — the direct origin. */
const WIKI_ORIGIN = "https://encyklopediafantastyki.pl/api.php";

/**
 * Egress target for the encyclopedia API. The origin 403-blocks datacenter IPs
 * (e.g. Render), so `WIKI_PROXY_URL` can point every request at a proxy whose IP
 * the origin accepts — typically a Cloudflare Worker that replays the same query
 * params to `api.php` (see `cloudflare/wiki-proxy.js`). Unset = direct (default,
 * unchanged). Read at call time so it's env-driven and testable.
 */
export function resolveWikiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.WIKI_PROXY_URL?.trim() || WIKI_ORIGIN;
}

// Shared secret for the proxy: sent as a header so the Worker can reject anyone
// but us (an open proxy would get the Worker itself blocked). Harmless when
// talking to the origin directly — MediaWiki ignores the unknown header.
const proxyKey = process.env.WIKI_PROXY_KEY?.trim();

const wikiAxios = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    ...(proxyKey ? { 'X-Proxy-Key': proxyKey } : {})
  }
});

/**
 * A fetch error from the encyclopedia with a recognized cause class.
 * Services and diagnostics can read `classification` and `userHint`
 * to show the user a specific, useful message.
 */
export class WikiFetchError extends Error {
  classification: ErrorClass;
  status?: number;
  code?: string;
  userHint: string;
  constructor(message: string, info: { class: ErrorClass; status?: number; code?: string; hint: string }) {
    super(message);
    this.name = "WikiFetchError";
    this.classification = info.class;
    this.status = info.status;
    this.code = info.code;
    this.userHint = info.hint;
  }
}

export class WikiAdapter {
  /** Direct origin, or the proxy from `WIKI_PROXY_URL`. Resolved per call. */
  private get baseUrl(): string { return resolveWikiBaseUrl(); }

  /**
   * Returns a page's wikitext or "" when the page doesn't exist.
   * Throws on infrastructure failure (IP block, timeout after retry) —
   * a missing page and a network failure are different situations and services must
   * distinguish them, otherwise a full failure reports as an empty, "successful" sync.
   */
  async fetchPageContent(title: string): Promise<string> {
    try {
      const response = await withRetry(() => wikiAxios.get(this.baseUrl, {
        params: {
          action: "query",
          prop: "revisions",
          rvprop: "content",
          titles: title,
          redirects: 1,
          format: "json",
          formatversion: 2
        }
      }), 3, 2000);

      // With formatversion=2 pages is an array, and the content is in rev.content;
      // handle both shapes (older MediaWiki ignore formatversion)
      const pages = response.data.query?.pages;
      const page = Array.isArray(pages) ? pages[0] : pages?.[Object.keys(pages ?? {})[0]];

      if (!page || page.missing || page.invalid || !page.revisions) {
        console.warn(`Nie znaleziono strony "${title}" w encyklopedii.`);
        return "";
      }

      const rev = page.revisions[0];
      return rev.content ?? rev["*"] ?? rev.slots?.main?.content ?? "";
    } catch (error: any) {
      const info = classifyHttpError(error);
      log.error(`Nie udało się pobrać strony "${title}"`, {
        title, class: info.class, status: info.status, code: info.code,
        message: error?.message, snippet: info.snippet,
      });
      throw new WikiFetchError(
        `Nie udało się pobrać strony "${title}" z encyklopedii (${info.class}${info.status ? ` / HTTP ${info.status}` : ""}). ${info.hint}`,
        info
      );
    }
  }


  /**
   * Fetches the content of multiple pages. Returns a content map plus a list of titles
   * that couldn't be fetched (chunk failure) — services report them in the
   * summary instead of silently skipping books.
   */
  async fetchPagesContentBulk(titles: string[]): Promise<{ contents: Record<string, string>, failedTitles: string[] }> {
    const results: Record<string, string> = {};
    const failedTitles: string[] = [];

    // MediaWiki API allows up to 50 titles per request
    const chunkSize = 50;
    for (let i = 0; i < titles.length; i += chunkSize) {
      const chunk = titles.slice(i, i + chunkSize);
      const titlesParam = chunk.join('|');

      try {
        // MediaWiki truncates large responses (revision size limits) and returns
        // a continue token — follow it, otherwise some pages silently disappear
        let continueParams: Record<string, string> = {};
        do {
          const response = await withRetry(() => wikiAxios.get(this.baseUrl, {
            params: {
              action: "query",
              prop: "revisions",
              rvprop: "content",
              rvslots: "main",
              titles: titlesParam,
              redirects: 1,
              format: "json",
              ...continueParams
            }
          }), 3, 2000);

          const pages = response.data.query?.pages;
          if (pages) {
            for (const pageId of Object.keys(pages)) {
              const page = pages[pageId];
              if (pageId !== "-1" && page.revisions && page.revisions.length > 0) {
                const rev = page.revisions[0];
                const content = rev.slots?.main?.["*"] || rev["*"] || rev.content || "";
                results[page.title.toLowerCase()] = content;
              }
            }
          }

          // Map normalized titles back to original requested titles
          const normalized = response.data.query?.normalized;
          if (normalized) {
            for (const norm of normalized) {
              if (results[norm.to.toLowerCase()]) {
                results[norm.from.toLowerCase()] = results[norm.to.toLowerCase()];
              }
            }
          }

          // Map redirects back to original requested titles
          const redirects = response.data.query?.redirects;
          if (redirects) {
            for (const redir of redirects) {
              if (results[redir.to.toLowerCase()]) {
                results[redir.from.toLowerCase()] = results[redir.to.toLowerCase()];
              }
            }
          }

          continueParams = response.data.continue || {};
        } while (Object.keys(continueParams).length > 0);
      } catch (error: any) {
        const info = classifyHttpError(error);
        log.warn(`Bulk fetch chunku nieudany (${chunk.length} tytułów pominięto)`, {
          class: info.class, status: info.status, code: info.code,
          message: error?.message, snippet: info.snippet,
          firstTitles: chunk.slice(0, 3),
        });
        // Continue with other chunks even if one fails, but record what was lost
        failedTitles.push(...chunk);
      }
    }

    return { contents: results, failedTitles };
  }

  async searchPage(query: string, limit: number = 3): Promise<string[]> {
    try {
      const response = await withRetry(() => wikiAxios.get(this.baseUrl, {
        params: {
          action: "query",
          list: "search",
          srsearch: query,
          srlimit: limit,
          format: "json"
        }
      }), 3, 2000);

      const results = response.data.query?.search;
      if (results && results.length > 0) {
        return results.map((r: any) => r.title);
      }
      return [];
    } catch (error: any) {
      const info = classifyHttpError(error);
      log.warn(`Wyszukiwanie "${query}" nieudane`, { class: info.class, status: info.status, code: info.code, message: error?.message });
      return [];
    }
  }

  async fetchCategoryMembers(category: string): Promise<string[]> {
    let allTitles: string[] = [];
    let cmcontinue: string | undefined = undefined;

    try {
      do {
        const response = await withRetry(() => wikiAxios.get(this.baseUrl, {
          params: {
            action: "query",
            list: "categorymembers",
            cmtitle: category,
            cmlimit: 500,
            cmcontinue: cmcontinue,
            format: "json",
            formatversion: 2
          }
        }), 3, 2000);

        const members = response.data.query.categorymembers;
        if (members) {
          allTitles = allTitles.concat(members.map((m: any) => m.title));
        }

        cmcontinue = response.data.continue?.cmcontinue;
      } while (cmcontinue);

      return allTitles;
    } catch (error: any) {
      const info = classifyHttpError(error);
      log.warn(`Pobieranie kategorii "${category}" nieudane (zwracam ${allTitles.length} zebranych)`, { class: info.class, status: info.status, code: info.code, message: error?.message });
      // Return what was collected before the failure, instead of discarding partial results
      return allTitles;
    }
  }

  async fetchLastRevisionDate(title: string): Promise<string> {
    try {
      const response = await withRetry(() => wikiAxios.get(this.baseUrl, {
        params: {
          action: "query",
          prop: "revisions",
          rvprop: "timestamp",
          titles: title,
          format: "json",
          formatversion: 2
        }
      }), 3, 2000);

      const query = response.data.query;
      if (!query || !query.pages) return "Nieznana";

      const pages = query.pages;
      const page = Array.isArray(pages) ? pages[0] : pages[Object.keys(pages)[0]];

      if (!page || page.missing || page.invalid) {
        return "Nieznana";
      }

      const timestamp = page.revisions?.[0]?.timestamp;
      if (!timestamp) return "Nieznana";

      return new Date(timestamp).toLocaleDateString("pl-PL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
    } catch (error: any) {
      console.warn(`Wiki API error for "${title}": ${error.message}`);
      return "Nieznana"; // Graceful degradation for 403 Forbidden / blocks
    }
  }
}
