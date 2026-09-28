import { NotionAdapter } from "./notion.adapter";
import { WikiAdapter } from "./wiki.adapter";
import { BookSyncService } from "./services/bookSyncService";
import { DuplicateSyncService } from "./services/duplicateSyncService";
import { PublisherSyncService } from "./services/publisherSyncService";
import { SeriesSyncService } from "./services/seriesSyncService";
import { CyclesSyncService } from "./services/cyclesSyncService";
import { LpSyncService } from "./services/lpSyncService";
import { StatsService } from "./services/statsService";
import { PurificationService } from "./services/purificationService";
import { SchemaValidationService } from "./services/schemaValidationService";
import { IntegrityService } from "./services/integrityService";
import { LibraryCheckService } from "./services/libraryCheckService";
import { VintedSyncService } from "./services/vintedSyncService";
import { CycleLookupService } from "./services/cycleLookupService";
import { BookDetailService } from "./services/bookDetailService";
import { CycleHarvestService } from "./services/cycleHarvestService";
import { IsbnEnrichService } from "./services/isbnEnrichService";
import { aggregateCycleRows } from "./services/cycleRows";
import { fetchAwardPage } from "./services/awardBooksSource";
import { lookupIsbn } from "./services/isbnLookupService";
import { toSearchIndex } from "./services/bookSearchIndex";
import { isAwardBook } from "./services/bookCategory";
import { normalizeIsbn } from "./services/isbn";
import { ConfigService } from "./services/configService";
import { createLogger, classifyHttpError } from "./logger";
import { SyncEvent } from "./src/types";

/**
 * Domain composition root: builds the adapters, services and the SyncManager orchestrator.
 * Kept away from `server.ts` (which is only the HTTP entrypoint) — so that
 * controllers import `syncManager` from here, not from the server module, which
 * breaks the server → routes → controller → server cycle.
 */

const log = createLogger("SyncManager");

/** Today as a Notion calendar day („YYYY-MM-DD", UTC). Day-granular on purpose —
 *  reading-velocity stats aggregate by month/year, so intra-day precision (and the
 *  server↔user timezone skew near midnight) doesn't matter. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const notionAdapter = new NotionAdapter(process.env.NOTION_API_KEY!, process.env.NOTION_DATABASE_ID!);
const wikiAdapter = new WikiAdapter();
/** App configuration (knobs) — defaults + overrides from Notion; injected into the services. */
export const configService = new ConfigService(notionAdapter);
const duplicateSyncService = new DuplicateSyncService(notionAdapter, configService);
const bookSyncService = new BookSyncService(notionAdapter, wikiAdapter, configService);
const publisherSyncService = new PublisherSyncService(notionAdapter, wikiAdapter);
const seriesSyncService = new SeriesSyncService(notionAdapter, wikiAdapter);
const cyclesSyncService = new CyclesSyncService(notionAdapter, wikiAdapter, configService);
const lpSyncService = new LpSyncService(notionAdapter);
const statsService = new StatsService(notionAdapter, configService);
const purificationService = new PurificationService(notionAdapter);
const schemaValidationService = new SchemaValidationService(notionAdapter);
const integrityService = new IntegrityService(notionAdapter, wikiAdapter, configService);
const libraryCheckService = new LibraryCheckService(notionAdapter, configService);
const vintedSyncService = new VintedSyncService(notionAdapter, configService);
const cycleLookupService = new CycleLookupService(notionAdapter, wikiAdapter);
const cycleHarvestService = new CycleHarvestService(notionAdapter, cycleLookupService, configService);
const isbnEnrichService = new IsbnEnrichService(notionAdapter);
const bookDetailService = new BookDetailService(wikiAdapter);

interface SyncTask {
  name: string;
  cancelRequested: boolean;
}

/** Canonical sync ritual names — single source of truth for dispatch. */
export type SyncTaskName =
  | "book"
  | "purify"
  | "schema"
  | "publisher"
  | "series"
  | "duplicates"
  | "lp"
  | "cycles"
  | "cycles-harvest"
  | "isbn-enrich"
  | "integrity"
  | "library"
  | "vinted"
  | "vinted-resolve-sellers";

type TaskFn = (checkCancellation: () => boolean) => Promise<void>;

/**
 * Ritual registry: name → `taskFn` factory. Each service has a differently named
 * `run*` method, but they all share the same contract `(sendEvent, checkCancellation)`;
 * the registry ties them into one table, so SyncManager.run() is a single
 * generic dispatcher instead of a dozen twin methods. `book` and
 * `library` take extra parameters from the request (via the `params` argument).
 */
const TASK_REGISTRY: Record<SyncTaskName, (sendEvent: (data: SyncEvent) => void, params?: any) => TaskFn> = {
  book:       (s, p) => (cc) => bookSyncService.runBookSync(p ?? {}, s, cc),
  purify:     (s) => (cc) => purificationService.runPurification(s, cc),
  schema:     (s) => (cc) => schemaValidationService.runSchemaValidation(s, cc),
  publisher:  (s) => (cc) => publisherSyncService.runPublisherSync(s, cc),
  series:     (s) => (cc) => seriesSyncService.runSeriesSync(s, cc),
  duplicates: (s) => (cc) => duplicateSyncService.runDuplicateCheck(s, cc),
  lp:         (s) => (cc) => lpSyncService.runLpSync(s, cc),
  cycles:     (s) => (cc) => cyclesSyncService.runCyclesSync(s, cc),
  "cycles-harvest": (s) => (cc) => cycleHarvestService.runCycleHarvest(s, cc),
  "isbn-enrich": (s) => (cc) => isbnEnrichService.runIsbnEnrich(s, cc),
  integrity:  (s) => (cc) => integrityService.runIntegrityCheck(s, cc),
  library:    (s, p) => (cc) => libraryCheckService.runLibraryCheck(p.libraryCode, s, cc),
  vinted:     (s, p) => (cc) => vintedSyncService.runVintedCheck(s, cc, p),
  "vinted-resolve-sellers": (s, p) => (cc) => vintedSyncService.resolveSellersToStore(s, cc, p),
};

class SyncManager {
  private currentTask: SyncTask | null = null;

  constructor(private notion: NotionAdapter, private wiki: WikiAdapter) {}

  get activeTask() {
    return this.currentTask?.name ?? null;
  }

  get isSyncing() {
    return this.currentTask !== null;
  }

  async getStats() {
    return await statsService.getStats();
  }

  /**
   * Slimmed-down book index for the „Katalog" search (client-side). `fresh` bypasses
   * the cache; `all` includes cycle volumes too (award-only by default, for the Regał).
   */
  async getBooks(fresh = false, all = false) {
    const books = await this.notion.getBooksForStats(undefined, undefined, { cache: !fresh });
    return toSearchIndex(books, !all);
  }

  /**
   * Read-only diagnostic for the barcode scan: for a given code, report exactly what the
   * server sees — whether the ISBN is stored on any row (award or cycle volume), on which
   * book, its category, and whether that row is in the award-only Katalog index (the
   * only rows a scan can match). Bypasses the cache so it reflects Notion right now.
   */
  async scanDebug(rawCode: string) {
    const normalized = normalizeIsbn(rawCode);
    const target = (normalized || rawCode).replace(/\D/g, "");
    const all = await this.notion.getBooksForStats(undefined, undefined, { cache: false });
    const matches = all
      .filter((b) => (b.isbns || []).some((i) => i.replace(/\D/g, "") === target))
      .map((b) => ({
        title: b.plTitle || b.origTitle || b.id,
        kategoria: b.kategoria || "Nagroda",
        isbns: b.isbns || [],
        inScanIndex: isAwardBook(b),
      }));
    return {
      input: rawCode,
      normalized,
      totalBooks: all.length,
      scanIndexSize: all.filter(isAwardBook).length,
      matchCount: matches.length,
      matches,
    };
  }

  async getNotionSchema() {
    return await this.notion.getSchema();
  }

  async updateNotionSchema(propertyName: string, propertyType: string, newOptions: any) {
    return await this.notion.updateSchema(propertyName, propertyType, newOptions);
  }

  private async executeTask(taskName: string, taskFn: (checkCancellation: () => boolean) => Promise<void>) {
    if (this.isSyncing) throw new Error(`Inna synchronizacja (${this.activeTask}) jest już w toku.`);
    const task: SyncTask = { name: taskName, cancelRequested: false };
    this.currentTask = task;
    try {
      await taskFn(() => task.cancelRequested);
    } finally {
      // Release the lock only if it still belongs to this task —
      // after resetSyncState() a new task may have already started
      if (this.currentTask === task) {
        this.currentTask = null;
      }
    }
  }

  /**
   * Generic ritual dispatch: takes the factory from the registry, builds `taskFn`
   * and runs it under the single-task lock. `params` carry data
   * from the request for rituals that need it (`book`, `library`).
   */
  async run(taskName: SyncTaskName, sendEvent: (data: SyncEvent) => void, params?: any) {
    const makeTaskFn = TASK_REGISTRY[taskName];
    if (!makeTaskFn) throw new Error(`Nieznany rytuał synchronizacji: ${taskName}`);
    await this.executeTask(taskName, makeTaskFn(sendEvent, params));
  }

  async getWikiLastUpdate(pageTitle: string) {
    return await this.wiki.fetchLastRevisionDate(pageTitle);
  }

  // Appends a „Źródło" tag on a book's page. Defaults to „Przeczytane"
  // (button in owned resources / library stats), but the library scanner
  // passes a branch tag („Biblioteka" = Felin, „Biblioteka 9" =
  // Bronowice), to mark which branch the item is available in.
  async markAsRead(pageId: string, tag: string = "Przeczytane") {
    const res = await this.notion.addTagToMultiSelect(pageId, "Źródło", tag);
    // Only the „Przeczytane" tag stamps the read date — branch tags („Biblioteka…")
    // and „Posiadam" mark availability/ownership, not a completed read. Captured
    // from now forward (historical dates can't be backfilled). Edge: re-marking an
    // already-read book re-stamps today; the UI marks only on the unread→read
    // transition, so this doesn't happen in practice.
    if (tag === "Przeczytane") await this.notion.setReadDate(pageId, todayIso());
    return res;
  }

  /** Removes a „Źródło" tag (inverse of `markAsRead`) — drag&drop on the shelf. */
  async unmarkRead(pageId: string, tag: string = "Przeczytane") {
    const res = await this.notion.removeTagFromMultiSelect(pageId, "Źródło", tag);
    if (tag === "Przeczytane") await this.notion.setReadDate(pageId, null);
    return res;
  }

  /** Writes manual shelf ordering keys (precise drag&drop). */
  async setShelfOrders(entries: { pageId: string; order: number }[]) {
    return await this.notion.setShelfOrders(entries);
  }

  /** Reads stored Vinted results (tiles/bundles from the DB — no re-scrape). */
  async getVintedStored() {
    return await vintedSyncService.getStoredData();
  }

  /** Cycle preview for a book (on demand, no DB writes). */
  /** Aggregated cycles view (from rows tagged with the `Cykl` field) for the Archiwum. */
  /** `fresh` (manual „Odśwież Dane") bypasses the 5-min book cache → data as in /api/stats. */
  async getCyclesHarvest(fresh = false) {
    const books = await this.notion.getBooksForStats(undefined, undefined, { cache: !fresh });
    return aggregateCycleRows(books);
  }

  async getCycle(title: string, author: string) {
    return await cycleLookupService.lookup(title, author);
  }

  /** On-demand book-detail preview (cover + blurb) — Katalog, no DB writes.
   *  `isbn` (optional) picks the matching edition's cover (e.g. a barcode scan). */
  async getBookDetail(title: string, author: string, isbn?: string) {
    return await bookDetailService.lookup(title, author, isbn);
  }

  /** Resolves a scanned/typed ISBN to a book (title + author) via Google Books. */
  async lookupIsbn(code: string) {
    return await lookupIsbn(code);
  }

  /**
   * End-to-end diagnostics: checks the Notion connection plus fetching and
   * parsing each award page from the encyclopedia. Returns a JSON structure
   * that can be opened in the browser (GET /api/diagnostics) — one place
   * to see WHY sync doesn't work (IP block, missing page, 0 books).
   */
  async runDiagnostics() {
    const startedAt = Date.now();
    const report: any = {
      env: {
        hasNotionKey: !!process.env.NOTION_API_KEY,
        hasDatabaseId: !!process.env.NOTION_DATABASE_ID,
        nodeEnv: process.env.NODE_ENV || "(unset)",
      },
      notion: { ok: false } as any,
      wiki: [] as any[],
      summary: "",
    };

    // 1. Notion — initialization and a light schema read
    try {
      await this.notion.init();
      const schema = await this.notion.getSchema();
      report.notion = { ok: true, propertyCount: schema ? Object.keys(schema).length : 0 };
      log.info("Diagnostics: Notion OK", report.notion);
    } catch (err: any) {
      report.notion = { ok: false, error: err?.message, code: err?.code };
      log.error("Diagnostics: Notion FAILED", report.notion);
    }

    // 2. Wiki — fetch each award page separately (list from the `sync.awards` config)
    const AWARDS = (await configService.getConfig()).sync.awards;
    for (const aw of AWARDS) {
      const t0 = Date.now();
      try {
        const books = await fetchAwardPage(wikiAdapter, aw.title, aw.name, () => {});
        const entry = {
          award: aw.name, pageTitle: aw.title, ok: true,
          booksParsed: books.length, ms: Date.now() - t0,
          note: books.length === 0 ? "Pobrano stronę, ale sparsowano 0 książek — sprawdź tytuł strony lub układ tabeli." : undefined,
        };
        report.wiki.push(entry);
        log.info("Diagnostics: wiki page OK", entry);
      } catch (err: any) {
        const info = classifyHttpError(err);
        const entry = {
          award: aw.name, pageTitle: aw.title, ok: false,
          classification: err?.classification || info.class,
          status: err?.status || info.status,
          hint: err?.userHint || info.hint,
          error: err?.message, ms: Date.now() - t0,
        };
        report.wiki.push(entry);
        log.error("Diagnostics: wiki page FAILED", entry);
      }
    }

    // 3. Diagnosis summary
    const wikiOk = report.wiki.filter((w: any) => w.ok);
    const wikiBlocked = report.wiki.filter((w: any) => w.classification === "ip_blocked");
    if (!report.notion.ok) {
      report.summary = "Notion nie odpowiada — sprawdź NOTION_API_KEY / NOTION_DATABASE_ID i dostęp integracji.";
    } else if (wikiBlocked.length > 0) {
      report.summary = "Encyklopedia blokuje żądania serwera (403/Cloudflare). To najczęstsza przyczyna niedziałających synchronizacji na hostingu — IP serwera jest zablokowane. Uruchom lokalnie lub użyj proxy o zaufanym IP.";
    } else if (wikiOk.length > 0 && wikiOk.every((w: any) => w.booksParsed === 0)) {
      report.summary = "Strony pobrane, ale sparsowano 0 książek — prawdopodobnie zmienił się tytuł strony w encyklopedii albo układ tabeli.";
    } else if (wikiOk.length === report.wiki.length) {
      report.summary = "Wszystko działa: Notion i encyklopedia odpowiadają, książki są parsowane. Jeśli sync nadal nie działa, sprawdź logi konkretnego rytuału.";
    } else {
      report.summary = "Częściowa awaria pobierania z encyklopedii — szczegóły w polu 'wiki'.";
    }
    report.ms = Date.now() - startedAt;
    return report;
  }

  stopActiveSync() {
    if (this.currentTask) {
      this.currentTask.cancelRequested = true;
      return true;
    }
    return false;
  }

  resetSyncState() {
    // Cancel the active task, but do NOT reset the lock immediately. Previously
    // resetSyncState set currentTask = null right away, so isSyncing
    // became false and the next POST /sync-* started a second task while
    // the orphaned one was still writing to Notion (breaking "exactly one sync at a time").
    // Instead we signal cancellation; the lock releases in the task's `finally`
    // (identity-check) once it notices cancelRequested and exits — and since
    // all rituals check checkCancellation in their loops and have bounded
    // timeouts (axios/withRetry), this happens quickly and without a window of concurrent writes.
    this.stopActiveSync();
  }
}

export const syncManager = new SyncManager(notionAdapter, wikiAdapter);
