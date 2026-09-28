import { Request, Response } from "express";
import { SyncEvent } from "../src/types";
import { syncManager } from "../syncManager";
import { createLogger, sanitizeErrorMessage } from "../logger";

const log = createLogger("SSE");

/**
 * SSE stream plumbing for long rituals — headers, proxy hardening,
 * keepalive, cancellation on client disconnect. Split out of the controller, which
 * should hold only request parsing and delegation; the transport lives here.
 */

/** Set SSE headers + hardening for buffering proxies; return a `sendEvent` function. */
export const setupSSE = (res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable proxy-side buffering (nginx/Render) — without it SSE events
  // don't reach the client in real time and the UI "doesn't react" on hosting.
  res.setHeader("X-Accel-Buffering", "no");
  // Send headers immediately so the connection is open before the task starts.
  res.flushHeaders?.();
  // ~2KB comment padding: some proxies (Render) buffer the response up to a
  // few-KB threshold before they start streaming — this fills the buffer and forces a flush,
  // so the client gets events in real time (not only at the end).
  res.write(`:${" ".repeat(2048)}\n\n`);
  return (data: SyncEvent) => {
    // After a client abort the socket can be `destroyed` while still `writableEnded === false`
    // — a writableEnded-only guard let a write through to a dead socket, which threw
    // an unhandled 'error' on the stream. Check destroyed too.
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
};

/**
 * Run a sync task as an SSE stream: single-ritual guard, keepalive
 * every 5 s, cancellation on client disconnect (on `res`, not `req`) and mapping
 * an error to an `error` event.
 */
export const executeSyncTask = async (
  req: Request,
  res: Response,
  task: (sendEvent: (data: SyncEvent) => void) => Promise<void>,
  errorMessage: string
) => {
  if (syncManager.isSyncing) return res.status(400).json({ error: "Inna synchronizacja jest już w toku." });

  const sendEvent = setupSSE(res);
  // Immediate signal that the connection is alive — the user sees a reaction right away,
  // even if the task's first step (fetching from the wiki) takes a few seconds.
  sendEvent({ type: "status", message: "Połączono z serwerem. Inicjacja rytuału..." });
  log.info("Sync task started", { endpoint: req.path });

  // A more frequent keepalive (5s) keeps the stream "hot" at proxies that otherwise
  // collect data into a buffer between the long task's infrequent writes.
  const keepAlive = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": keepalive\n\n");
  }, 5000);

  // Client disconnect (closed tab, network loss) — cancel the task,
  // so an orphaned sync doesn't block subsequent rituals for hours.
  // NOTE: we listen on res, not req. For a POST with a body, req emits "close"
  // after express.json() consumes the body — not on client disconnect —
  // which cancelled the active sync right after start. res "close" fires only when
  // the response actually closes; on a normal end writableEnded==true,
  // so the guard below doesn't cancel anything by mistake.
  res.on("close", () => {
    if (!res.writableEnded) {
      clearInterval(keepAlive);
      log.warn("Klient rozłączył się w trakcie synchronizacji — przerywam zadanie.", { endpoint: req.path });
      syncManager.stopActiveSync();
    }
  });

  // Writing to the stream (sendEvent/keepalive) has a check-then-write race: a TCP reset between
  // the `!writableEnded` guard and `res.write` emits 'error'. Without a listener this would become
  // an unhandled uncaughtException. Swallow and log — `res.on('close')` cleans up anyway.
  res.on("error", (err: any) => {
    log.warn("Błąd strumienia SSE (klient prawdopodobnie się rozłączył).", { endpoint: req.path, error: err?.message });
  });

  try {
    await task(sendEvent);
    clearInterval(keepAlive);
    log.info("Sync task finished", { endpoint: req.path });
    res.end();
  } catch (error: any) {
    clearInterval(keepAlive);
    log.error(`${errorMessage} ${error?.message || ""}`, {
      endpoint: req.path,
      name: error?.name,
      classification: error?.classification,
      status: error?.status,
      stack: error?.stack?.split("\n").slice(0, 4).join(" | "),
    });
    // WikiFetchError's message already carries its userHint; sanitize so a Notion
    // error flowing through a sync task can't leak the database id over SSE.
    const userMessage = sanitizeErrorMessage(error, errorMessage);
    sendEvent({ type: "error", error: userMessage });
    res.end();
  }
};
