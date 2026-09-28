import fs from "fs";
import path from "path";
import { VintedSession } from "./vintedHttp";
import { parseSetCookie } from "./cookies";

const VINTED_HOME = "https://www.vinted.pl/";

/**
 * Locates a Chromium binary to drive: an explicit `VINTED_CHROMIUM_PATH`, else the
 * Playwright-managed browsers dir (`PLAYWRIGHT_BROWSERS_PATH`, default /opt/pw-browsers),
 * else undefined (let playwright-core resolve its own). Undefined is fine — a failed
 * launch is caught and the caller falls back to lightweight priming.
 */
function resolveChromiumPath(): string | undefined {
  if (process.env.VINTED_CHROMIUM_PATH) return process.env.VINTED_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dirs = fs.readdirSync(root).filter((d) => d.startsWith("chromium-") && !d.includes("headless"));
    for (const d of dirs.sort().reverse()) {
      const exe = path.join(root, d, "chrome-linux", "chrome");
      if (fs.existsSync(exe)) return exe;
    }
  } catch { /* no managed browsers here */ }
  return undefined;
}

/**
 * BROWSER priming (backlog anti-block point 2): drive a headless Chromium to the Vinted
 * home page so Cloudflare's JS challenge actually runs, then harvest the resulting cookies
 * (a real `cf_clearance`) + the browser's own User-Agent for the lightweight axios path.
 *
 * Uses `playwright-core` (dynamic import → no hard dependency, no browser download; the
 * browser binary is supplied externally). EVERYTHING is best-effort: no playwright-core, no
 * Chromium binary, a launch error, or no `cf_clearance` within the timeout → returns null and
 * the caller falls back to the plain HTTP prime (and, failing that, to an unprimed scan).
 *
 * Caveat: `cf_clearance` is partly bound to the client's TLS/JA3 fingerprint, so a
 * browser-minted cookie may still be rejected by a plain axios request. The scan's self-heal
 * probe detects that and drops the session, so this can help but never hurt the hit rate.
 */
export async function primeWithBrowser(opts: { timeoutMs: number }): Promise<VintedSession | null> {
  let browser: any = null;
  try {
    const pw: any = await import("playwright-core").catch(() => null);
    if (!pw?.chromium) return null;

    // Honor a standard outbound proxy if one is configured (corporate/sandboxed hosts);
    // absent → direct egress (the usual local/Render case).
    const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
    browser = await pw.chromium.launch({
      headless: true,
      executablePath: resolveChromiumPath(),
      proxy: proxyServer ? { server: proxyServer } : undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
    });
    const context = await browser.newContext({
      locale: "pl-PL",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(VINTED_HOME, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });

    // Poll until Cloudflare sets `cf_clearance` (the challenge runs async), bounded by timeout.
    // Scope to the Vinted host: `cookies(url)` returns only cookies that would be sent to
    // that URL, so a third-party cookie the challenge page happened to set never rides along
    // in our `Cookie` header (host-scoping — security sweep [8]). cf_clearance is set on the
    // Vinted domain, so it's still included.
    const deadline = Date.now() + opts.timeoutMs;
    let cookies: any[] = await context.cookies(VINTED_HOME);
    while (!cookies.some((c) => c.name === "cf_clearance") && Date.now() < deadline) {
      await page.waitForTimeout(500);
      cookies = await context.cookies(VINTED_HOME);
    }

    const userAgent: string = await page.evaluate(() => navigator.userAgent);
    // Reuse the same name=value join as the HTTP prime (dedup, skip empties).
    const cookie = parseSetCookie(cookies.map((c) => `${c.name}=${c.value}`));
    return cookie && userAgent ? { userAgent, cookie } : null;
  } catch {
    return null;
  } finally {
    try { if (browser) await browser.close(); } catch { /* ignore */ }
  }
}
