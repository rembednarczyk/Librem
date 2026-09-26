/**
 * Cloudflare Worker — reverse proxy for the Encyklopedia Fantastyki MediaWiki API.
 *
 * Why: the encyclopedia's origin 403-blocks datacenter IPs (a plain Apache
 * "403 Forbidden", not a Cloudflare challenge — see backlog.md). Librem runs on
 * Render, whose IP is blocked. This Worker forwards api.php requests so the
 * origin sees a Cloudflare IP instead. No browser / challenge-solving needed —
 * only a source IP the origin accepts.
 *
 * It replays the incoming query string verbatim to api.php and passes the
 * response straight back (status included, so a real 403 still surfaces if
 * Cloudflare's egress is ALSO blocked). Read-only: GET only.
 *
 * ── Deploy ────────────────────────────────────────────────────────────────
 * 1. Cloudflare dashboard → Workers & Pages → Create → paste this file.
 *    (Or `wrangler deploy` with this as the entry.)
 * 2. Settings → Variables → add a secret `PROXY_KEY` (any long random string).
 *    Leave it unset to run open (NOT recommended — anyone could use the Worker
 *    to hammer the encyclopedia and get it blocked).
 * 3. Note the Worker URL, e.g. https://wiki-proxy.<you>.workers.dev
 * 4. On the Render service (Librem) set two env vars:
 *       WIKI_PROXY_URL = https://wiki-proxy.<you>.workers.dev
 *       WIKI_PROXY_KEY = <the same PROXY_KEY value>
 *    Redeploy. WikiAdapter now routes every encyclopedia request through here,
 *    which fixes both the cycle preview AND book sync. Unset the vars to revert.
 *
 * If requests through the Worker still return 403, the origin blocks Cloudflare
 * egress ranges too → fall back to a residential/trusted proxy (same two env
 * vars, different URL).
 */

const ORIGIN = "https://encyklopediafantastyki.pl/api.php";
// Descriptive bot UA — better MediaWiki etiquette than a spoofed browser string,
// and a well-identified bot is likelier to be allowed than an anonymous one.
const FORWARD_UA = "LibremBot/1.0 (book-award tracker; +https://github.com/rembednarczyk/Librem)";
// Edge-cache successful API responses briefly to spare the origin repeated hits.
const CACHE_TTL_SECONDS = 300;

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Shared-secret gate: refuse anyone without the key, so this can't be used
    // as an open proxy. Only enforced when PROXY_KEY is configured.
    if (env.PROXY_KEY && request.headers.get("X-Proxy-Key") !== env.PROXY_KEY) {
      return new Response("Forbidden", { status: 403 });
    }

    const incoming = new URL(request.url);
    const target = new URL(ORIGIN);
    target.search = incoming.search; // replay the same api.php query params

    let originResp;
    try {
      originResp = await fetch(target.toString(), {
        method: "GET",
        headers: { "User-Agent": FORWARD_UA, "Accept": "application/json" },
        cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      });
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e}`, { status: 502 });
    }

    // Pass status + body straight through so the adapter's error classification
    // still sees a genuine 403/5xx if the origin refuses.
    const body = await originResp.arrayBuffer();
    return new Response(body, {
      status: originResp.status,
      headers: {
        "Content-Type": originResp.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
  },
};
