import { Request, Response } from "express";
import { syncManager, SyncTaskName, configService } from "../syncManager";
import { SyncParams } from "../src/types";
import { createLogger, sanitizeErrorMessage } from "../logger";
import { executeSyncTask } from "./sseStream";
import { normalizeIsbn } from "../services/isbn";

const log = createLogger("SyncController");

/** Guard: the endpoint needs Notion credentials. Sends 400 and returns false when missing. */
function requireNotionKeys(res: Response): boolean {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    res.status(400).json({ error: "Brak kluczy API Notion." });
    return false;
  }
  return true;
}

export const getStats = async (req: Request, res: Response) => {
  try {
    const stats = await syncManager.getStats();
    res.json(stats);
  } catch (error: any) {
    log.error("Stats error", { message: error.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Wystąpił błąd podczas pobierania statystyk.") });
  }
};

export const getBooks = async (req: Request, res: Response) => {
  try {
    // `fresh=1` bypasses the 5-min server cache — used by the barcode scan so a
    // just-enriched (or manually-edited) ISBN is visible immediately.
    const fresh = req.query.fresh === "1" || req.query.fresh === "true";
    // `all=1` includes cycle volumes (not just award books) — the full Katalog / scan index.
    const all = req.query.all === "1" || req.query.all === "true";
    const books = await syncManager.getBooks(fresh, all);
    res.json(books);
  } catch (error: any) {
    log.error("Books error", { message: error.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Wystąpił błąd podczas pobierania rekordów.") });
  }
};

export const getWikiLastUpdate = async (req: Request, res: Response) => {
  try {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: "Missing title parameter" });
    const lastUpdate = await syncManager.getWikiLastUpdate(title as string);
    res.json({ lastUpdate });
  } catch (error: any) {
    log.error("Wiki last-update error", { message: error.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Wystąpił błąd podczas pobierania daty aktualizacji.") });
  }
};

export const getDiagnostics = async (req: Request, res: Response) => {
  try {
    const report = await syncManager.runDiagnostics();
    // Always return 200 — the report itself describes the status; makes it easier to read in the browser.
    res.json(report);
  } catch (error: any) {
    log.error("Diagnostics endpoint failed", { message: error?.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Diagnostyka nie powiodła się.") });
  }
};

export const getHealth = (req: Request, res: Response) => {
  res.json({ 
    status: "ok",
    isSyncing: syncManager.isSyncing
  });
};

export const getConfig = (req: Request, res: Response) => {
  res.json({
    hasNotionKey: !!process.env.NOTION_API_KEY,
    hasDatabaseId: !!process.env.NOTION_DATABASE_ID,
  });
};

/** Effective app configuration (defaults + overrides from Notion) — the „Konfiguracja" tab. */
export const getAppConfig = async (req: Request, res: Response) => {
  try {
    res.json(await configService.getConfig(req.query.force === "1"));
  } catch (error: any) {
    res.status(500).json({ error: sanitizeErrorMessage(error, "Nie udało się odczytać konfiguracji.") });
  }
};

/** Config save: input passes through the clamps in configSchema; the diff from defaults is stored. */
export const updateAppConfig = async (req: Request, res: Response) => {
  try {
    res.json(await configService.saveConfig(req.body));
  } catch (error: any) {
    res.status(400).json({ error: sanitizeErrorMessage(error, "Nie udało się zapisać konfiguracji.") });
  }
};

export const getNotionSchema = async (req: Request, res: Response) => {
  try {
    const properties = await syncManager.getNotionSchema();
    if (!properties || Object.keys(properties).length === 0) {
      return res.json({ _empty: { type: "Baza danych nie ma żadnych kolumn (właściwości) lub jest całkowicie pusta." } });
    }
    res.json(properties);
  } catch (error: any) {
    log.error("Notion schema error", { message: error.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Wystąpił błąd podczas pobierania schematu.") });
  }
};

// This endpoint edits only select/multi_select column options — validate
// the input before it reaches Notion (a schema mutation is a privileged operation).
const ALLOWED_SCHEMA_TYPES = new Set(["select", "multi_select"]);

export const updateNotionSchema = async (req: Request, res: Response) => {
  try {
    const { propertyName, propertyType, newOptions } = req.body ?? {};

    if (typeof propertyName !== "string" || propertyName.trim() === "" || propertyName.length > 200) {
      return res.status(400).json({ error: "Nieprawidłowa nazwa właściwości." });
    }
    if (!ALLOWED_SCHEMA_TYPES.has(propertyType)) {
      return res.status(400).json({ error: `Niedozwolony typ właściwości: ${propertyType}. Dozwolone: select, multi_select.` });
    }
    if (!Array.isArray(newOptions) || newOptions.length > 500 ||
        !newOptions.every(o => o && typeof o === "object" && typeof o.name === "string")) {
      return res.status(400).json({ error: "Nieprawidłowa lista opcji (oczekiwano tablicy { name })." });
    }

    // The write REPLACES a column's option list wholesale, so it is destructive by
    // nature: removing an option clears that value from every row that used it. The
    // type allow-list above says nothing about WHICH column or HOW MUCH is removed.
    // Validate against the live schema rather than a hardcoded column list (which would
    // drift): the column must already exist, keep its type, and lose at most one option
    // per request — which is exactly what the editor's add/delete-one flow produces.
    const schema = await syncManager.getNotionSchema();
    const existing = schema?.[propertyName];
    if (!existing) {
      return res.status(400).json({ error: `Kolumna „${propertyName}" nie istnieje w bazie.` });
    }
    if (existing.type !== propertyType) {
      return res.status(400).json({ error: `Kolumna „${propertyName}" jest typu ${existing.type}, nie ${propertyType}.` });
    }

    const currentNames: string[] = (existing[propertyType]?.options ?? []).map((o: any) => o?.name).filter((n: any): n is string => typeof n === "string");
    const keptNames = new Set(newOptions.map((o: { name: string }) => o.name));
    const removed = currentNames.filter((n) => !keptNames.has(n));
    if (removed.length > 1) {
      return res.status(400).json({
        error: `Odrzucono: żądanie usuwa ${removed.length} opcji naraz z kolumny „${propertyName}". Usuwaj po jednej — masowe czyszczenie kasuje wartości we wszystkich wierszach i jest nieodwracalne.`,
      });
    }

    await syncManager.updateNotionSchema(propertyName, propertyType, newOptions);
    res.json({ success: true });
  } catch (error: any) {
    log.error("Schema Update Error", { message: error?.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Wystąpił błąd podczas aktualizacji schematu.") });
  }
};

export const resetSyncState = (req: Request, res: Response) => {
  syncManager.resetSyncState();
  res.json({ success: true, message: "Stan synchronizacji został zresetowany." });
};

const stopSyncTask = (res: Response, message: string) => {
  if (syncManager.stopActiveSync()) {
    res.json({ success: true, message });
  } else {
    res.json({ success: false, message: "Brak trwającej synchronizacji." });
  }
};

// Stopping is global (cancels the active task, whatever it is) —
// the handlers differ only by message. We generate them from a factory.
const makeStopHandler = (message: string) =>
  (_req: Request, res: Response) => stopSyncTask(res, message);

export const stopSync = makeStopHandler("Zatrzymywanie synchronizacji...");
export const stopPublisherSync = makeStopHandler("Zatrzymywanie synchronizacji wydawnictw...");
export const stopSeriesSync = makeStopHandler("Zatrzymywanie synchronizacji serii...");
export const stopCyclesSync = makeStopHandler("Zatrzymywanie synchronizacji cykli...");
export const stopCyclesHarvest = makeStopHandler("Zatrzymywanie żniw cykli...");
export const stopIsbnEnrich = makeStopHandler("Zatrzymywanie nadawania sygnatur ISBN...");
export const stopLpSync = makeStopHandler("Zatrzymywanie aktualizacji Lp...");
export const stopDuplicatesSync = makeStopHandler("Zatrzymywanie sprawdzania duplikatów...");
export const stopLibraryCheck = makeStopHandler("Zatrzymywanie skanowania biblioteki...");
export const stopIntegrityCheck = makeStopHandler("Zatrzymano skanowanie integralności.");

export const runSync = async (req: Request, res: Response) => {
  const { awardName, pageTitle, syncAll } = req.body as SyncParams;

  if (!requireNotionKeys(res)) return;

  await executeSyncTask(
    req,
    res,
    (sendEvent) => syncManager.run("book", sendEvent, { awardName, pageTitle, syncAll }),
    "Sync Error:"
  );
};

// Rituals without request parameters have an identical handler — they differ only in
// the task name and error label. We generate them from a table instead of duplicating.
const makeSyncHandler = (task: SyncTaskName, errorLabel: string) =>
  async (req: Request, res: Response) => {
    await executeSyncTask(req, res, (sendEvent) => syncManager.run(task, sendEvent), errorLabel);
  };

export const runPublisherSync = makeSyncHandler("publisher", "Sync Publisher Error:");
export const runSeriesSync = makeSyncHandler("series", "Sync Series Error:");
export const runCyclesSync = makeSyncHandler("cycles", "Sync Cycles Error:");
export const runCyclesHarvest = makeSyncHandler("cycles-harvest", "Cycle Harvest Error:");
export const runIsbnEnrich = makeSyncHandler("isbn-enrich", "ISBN Enrich Error:");
export const runLpSync = makeSyncHandler("lp", "Sync Lp Error:");
export const runDuplicateCheck = makeSyncHandler("duplicates", "Sync Duplicates Error:");
export const runPurifySync = makeSyncHandler("purify", "Sync Purify Error:");
export const runSchemaSync = makeSyncHandler("schema", "Sync Schema Error:");
export const runIntegrityCheck = makeSyncHandler("integrity", "Integrity Check Error:");

export const stopPurifySync = makeStopHandler("Zatrzymano rytuał puryfikacji.");

export const stopSchemaSync = makeStopHandler("Zatrzymano inicjalizację schematu.");

// „Źródło" tags that may be added from this endpoint. Limited to
// a known set — the endpoint only marks an entry (read / available at
// a given branch), it cannot inject arbitrary tags into the Notion base.
const ALLOWED_SOURCE_TAGS = new Set(["Przeczytane", "Posiadam", "Biblioteka", "Biblioteka 9"]);

/** Validate + default the „Źródło" tag (mark/unmark share this). */
function resolveSourceTag(tag: unknown): { tag: string } | { error: string } {
  const sourceTag = (tag as string) ?? "Przeczytane";
  if (!ALLOWED_SOURCE_TAGS.has(sourceTag)) return { error: `Niedozwolony znacznik: ${sourceTag}.` };
  return { tag: sourceTag };
}

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { pageId, tag } = req.body;
    if (!pageId) return res.status(400).json({ error: "Missing pageId parameter" });

    const resolved = resolveSourceTag(tag);
    if ("error" in resolved) return res.status(400).json({ error: resolved.error });

    await syncManager.markAsRead(pageId, resolved.tag);
    res.json({ success: true });
  } catch (error: any) {
    log.error("Mark as read error", { message: error.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Wystąpił błąd podczas oznaczania pozycji.") });
  }
};

/**
 * Saving manual shelf-order keys (precise drag&drop). Small batch
 * (1 entry + optional renumbering of year ties) — a hard limit of 40 protects Notion.
 */
export const updateShelfOrders = async (req: Request, res: Response) => {
  try {
    const raw = req.body?.orders;
    if (!Array.isArray(raw) || raw.length === 0) return res.status(400).json({ error: "Brak wpisów orders." });
    if (raw.length > 40) return res.status(400).json({ error: "Za duża partia (limit 40 wpisów)." });
    const entries: { pageId: string; order: number }[] = [];
    for (const e of raw) {
      if (!e || typeof e.pageId !== "string" || !e.pageId || typeof e.order !== "number" || !isFinite(e.order)) {
        return res.status(400).json({ error: "Każdy wpis wymaga pageId (string) i skończonego order (number)." });
      }
      entries.push({ pageId: e.pageId, order: e.order });
    }
    await syncManager.setShelfOrders(entries);
    res.json({ success: true, updated: entries.length });
  } catch (error: any) {
    log.error("Shelf order error", { message: error.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Nie udało się zapisać porządku regału.") });
  }
};

export const unmarkAsRead = async (req: Request, res: Response) => {
  try {
    const { pageId, tag } = req.body;
    if (!pageId) return res.status(400).json({ error: "Missing pageId parameter" });

    const resolved = resolveSourceTag(tag);
    if ("error" in resolved) return res.status(400).json({ error: resolved.error });

    await syncManager.unmarkRead(pageId, resolved.tag);
    res.json({ success: true });
  } catch (error: any) {
    log.error("Unmark as read error", { message: error.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Wystąpił błąd podczas usuwania znacznika.") });
  }
};

export const checkVintedAvailability = async (req: Request, res: Response) => {
  if (!requireNotionKeys(res)) return;

  // Resume: the frontend can ask to skip books scanned within the last N hours.
  const skipRaw = req.body?.skipScannedWithinHours;
  const skipScannedWithinHours = typeof skipRaw === "number" && skipRaw > 0 ? Math.min(skipRaw, 24 * 365) : undefined;

  await executeSyncTask(
    req,
    res,
    (sendEvent) => syncManager.run("vinted", sendEvent, { skipScannedWithinHours }),
    "Vinted Check Error:"
  );
};

export const stopVintedCheck = makeStopHandler("Zatrzymywanie skanowania Vinted...");

export const resolveVintedSellers = async (req: Request, res: Response) => {
  if (!requireNotionKeys(res)) return;
  // No cap by default — resolution is incremental and resumable, so one pass
  // resolves all the missing ones it can. An optional `cap` from the body limits the pass.
  const capRaw = req.body?.cap;
  const cap = typeof capRaw === "number" && capRaw > 0 ? capRaw : undefined;

  await executeSyncTask(
    req,
    res,
    (sendEvent) => syncManager.run("vinted-resolve-sellers", sendEvent, { cap }),
    "Vinted Resolve Sellers Error:"
  );
};

export const stopVintedResolveSellers = makeStopHandler("Zatrzymywanie ustalania sprzedawców...");

export const getVintedStored = async (_req: Request, res: Response) => {
  if (!requireNotionKeys(res)) return;
  try {
    res.json(await syncManager.getVintedStored());
  } catch (error: any) {
    res.status(500).json({ error: sanitizeErrorMessage(error, "Błąd odczytu składowanych danych Vinted.") });
  }
};

/**
 * Cycle preview for a book (Katalog) — fetches the wiki page on demand, builds
 * the volume list and cross-refs the base. Does NOT write anything to Notion. 404 = the book
 * is not in a cycle / no data on the wiki.
 */
export const getCycle = async (req: Request, res: Response) => {
  const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
  const author = typeof req.query.author === "string" ? req.query.author.trim() : "";
  if (!title) return res.status(400).json({ error: "Brak parametru title." });
  try {
    const view = await syncManager.getCycle(title, author);
    if (!view) return res.status(404).json({ error: "Nie znaleziono cyklu dla tej książki." });
    res.json(view);
  } catch (error: any) {
    log.error("Cycle lookup error", { title, message: error?.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Błąd podglądu cyklu.") });
  }
};

export const getBookDetail = async (req: Request, res: Response) => {
  const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
  const author = typeof req.query.author === "string" ? req.query.author.trim() : "";
  const isbn = typeof req.query.isbn === "string" ? req.query.isbn.trim() : "";
  if (!title) return res.status(400).json({ error: "Brak parametru title." });
  try {
    const detail = await syncManager.getBookDetail(title, author, isbn || undefined);
    if (!detail) return res.status(404).json({ error: "Nie znaleziono szczegółów tej książki w Encyklopedii." });
    res.json(detail);
  } catch (error: any) {
    log.error("Book detail error", { title, message: error?.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Błąd podglądu szczegółów książki.") });
  }
};

export const getIsbn = async (req: Request, res: Response) => {
  const code = typeof req.params.code === "string" ? req.params.code : "";
  const isbn = normalizeIsbn(code);
  if (!isbn) return res.status(400).json({ error: "Nieprawidłowy ISBN." });
  try {
    const book = await syncManager.lookupIsbn(isbn);
    if (!book) return res.status(404).json({ error: "Nie znaleziono książki dla tego ISBN." });
    res.json(book);
  } catch (error: any) {
    log.error("ISBN lookup error", { isbn, message: error?.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Błąd wyszukiwania ISBN.") });
  }
};

export const getScanDebug = async (req: Request, res: Response) => {
  const code = typeof req.params.code === "string" ? req.params.code : "";
  try {
    const result = await syncManager.scanDebug(code);
    res.json(result);
  } catch (error: any) {
    log.error("Scan debug error", { code, message: error?.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Błąd diagnostyki skanu.") });
  }
};

export const getCyclesHarvest = async (req: Request, res: Response) => {
  try {
    const fresh = req.query.fresh === "1" || req.query.fresh === "true";
    res.json(await syncManager.getCyclesHarvest(fresh));
  } catch (error: any) {
    log.error("Cycles harvest read error", { message: error?.message });
    res.status(500).json({ error: sanitizeErrorMessage(error, "Błąd odczytu zebranych cykli.") });
  }
};

export const checkLibraryAvailability = async (req: Request, res: Response) => {
  const { libraryCode } = req.body;
  if (!libraryCode) return res.status(400).json({ error: "Missing libraryCode parameter" });

  await executeSyncTask(
    req,
    res,
    (sendEvent) => syncManager.run("library", sendEvent, { libraryCode }),
    "Library Check Error:"
  );
};
