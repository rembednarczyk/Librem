// Simple structured logger. One line per entry, readable in Render's logs,
// with component, level and optional context (no secrets).

type Level = "info" | "warn" | "error";

const LEVEL_TAG: Record<Level, string> = {
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function emit(level: Level, component: string, message: string, context?: Record<string, unknown>) {
  // We don't log secrets — context should contain only metadata.
  const parts = [`[${LEVEL_TAG[level]}]`, `[${component}]`, message];
  let line = parts.join(" ");
  if (context && Object.keys(context).length > 0) {
    try {
      line += " " + JSON.stringify(context);
    } catch {
      line += " [context not serializable]";
    }
  }
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line);
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  return {
    info: (m, c) => emit("info", component, m, c),
    warn: (m, c) => emit("warn", component, m, c),
    error: (m, c) => emit("error", component, m, c),
  };
}

// Notion IDs (database / data source / page) — UUID-shaped or bare 32-hex.
const NOTION_ID_RE = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/gi;

/**
 * Client-safe error text. Upstream (Notion SDK / adapter) messages can carry the
 * database id (e.g. „…o ID: 254fda05-…"), so returning `error.message` verbatim to
 * the browser leaks it (security sweep [8]). Redacts Notion-style ids to `[id]` and
 * falls back to a generic message when there's nothing usable. The FULL message is
 * still logged server-side — this only guards the HTTP response body.
 */
export function sanitizeErrorMessage(error: unknown, fallback: string): string {
  const msg = (error as { message?: unknown })?.message;
  if (typeof msg !== "string" || !msg.trim()) return fallback;
  return msg.replace(NOTION_ID_RE, "[id]");
}

/**
 * Classifies an HTTP request error (axios/network) into an understandable category.
 * Used to tell an IP/Cloudflare block apart from a plain timeout or an
 * application error — crucial when diagnosing "sync doesn't work".
 */
export type ErrorClass =
  | "ip_blocked"        // 403 / Cloudflare challenge — most common cause on hosting
  | "rate_limited"      // 429
  | "server_error"      // 5xx on the wiki side
  | "timeout"           // timed out / dropped connection
  | "dns"               // host not resolved
  | "http_error"        // other HTTP status
  | "unknown";

export function classifyHttpError(error: any): { class: ErrorClass; status?: number; code?: string; hint: string; snippet?: string } {
  const status: number | undefined = error?.response?.status ?? error?.status;
  const code: string | undefined = error?.code;
  const bodyRaw = error?.response?.data;
  const body = typeof bodyRaw === "string" ? bodyRaw : bodyRaw != null ? safeStringify(bodyRaw) : "";
  const looksCloudflare = /cloudflare|cf-ray|attention required|captcha|checking your browser|just a moment/i.test(body);
  const snippet = body ? body.slice(0, 300) : undefined;

  if (status === 403 || (status === 503 && looksCloudflare) || looksCloudflare) {
    return {
      class: "ip_blocked",
      status,
      code,
      snippet,
      hint: "Encyklopedia odrzuciła żądanie (403/Cloudflare). Najprawdopodobniej IP serwera (np. Render) jest blokowane. Rozwiązania: uruchom lokalnie/z innej sieci, użyj proxy o zaufanym IP, albo hostuj tam, gdzie IP nie jest zablokowane.",
    };
  }
  if (status === 429) {
    return { class: "rate_limited", status, code, snippet, hint: "Zbyt wiele żądań (429). Odczekaj i spróbuj ponownie." };
  }
  if (status && status >= 500) {
    return { class: "server_error", status, code, snippet, hint: `Błąd po stronie encyklopedii (${status}).` };
  }
  if (code === "ETIMEDOUT" || code === "ECONNABORTED" || code === "ECONNRESET" || /timeout|socket hang up/i.test(error?.message || "")) {
    return { class: "timeout", status, code, hint: "Przekroczono czas połączenia z encyklopedią. Sieć wolna lub host niedostępny." };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { class: "dns", status, code, hint: "Nie udało się rozwiązać adresu encyklopedii (DNS/sieć)." };
  }
  if (status) {
    return { class: "http_error", status, code, snippet, hint: `Nieoczekiwany status HTTP ${status}.` };
  }
  return { class: "unknown", status, code, hint: error?.message || "Nieznany błąd sieciowy." };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
