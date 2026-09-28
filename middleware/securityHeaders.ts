import { Request, Response, NextFunction } from "express";

/**
 * Baseline security response headers.
 *
 * HONEST SCOPE. The `script-src` below keeps `'unsafe-inline'`, because `index.html`
 * carries the pre-mount theme/favicon bootstrap (an inline script is what makes the
 * no-flash behaviour possible). So this CSP does NOT meaningfully mitigate XSS — and
 * it doesn't need to: the audit found no HTML-injection sink anywhere in `src/`
 * (no `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`). What it DOES buy is the
 * rest of the policy, which is what actually applies to this app:
 *
 *   - `frame-ancestors 'none'` (+ X-Frame-Options) — clickjacking. Relevant precisely
 *     because Basic Auth is on: an authenticated session could otherwise be framed and
 *     the sync buttons clicked through an overlay.
 *   - `form-action 'self'` — a second line under the CSRF middleware: even a form
 *     injected into our own page cannot post the session anywhere else.
 *   - `base-uri 'self'` — stops a `<base>` tag from re-pointing every relative URL.
 *   - `object-src 'none'` — no plugin content, ever.
 *   - `connect-src 'self'` — the SPA only ever fetches same-origin; this pins that.
 *
 * The allow-lists mirror what the app genuinely loads, nothing more: Google Fonts
 * (imported at the top of index.css) and Vinted offer thumbnails (images1.vinted.net).
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Inline bootstrap script in index.html — see the note above.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind + motion/react set element styles; fonts come from Google Fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // data: covers the inline SVG favicon; Vinted hosts serve offer thumbnails; the
  // encyclopedia serves book covers loaded directly in the viewer's browser (a
  // residential IP — not subject to the datacenter block on the server side).
  "img-src 'self' data: https://*.vinted.net https://*.vinted.pl https://encyklopediafantastyki.pl",
  "connect-src 'self'",
].join("; ");

export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    // `same-origin` rather than `no-referrer`: it keeps referrers off third parties
    // while still sending them within our own origin, which the CSRF middleware uses
    // as its fallback when `Origin` is absent.
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  };
}
