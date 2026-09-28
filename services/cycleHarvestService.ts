import pLimit from "p-limit";
import { NotionAdapter } from "../notion.adapter";
import { SyncEvent, NotionBook } from "../src/types";
import { ConfigService } from "./configService";
import { CycleLookupService, normTitle, HARVEST_MAX_HOPS } from "./cycleLookupService";
import { buildCycleVolumeProperties, cycleLpLabel, buildCycleTitleProperty } from "./cycleRows";
import { isCycleVolume } from "./bookCategory";
import { encyclopediaUrl } from "../src/utils/encyclopedia";
import { sanitizeNotionString } from "../utils";
import { createLogger } from "../logger";

const log = createLogger("CycleHarvest");

/**
 * The „Żniwa Cykli" ritual: for each book tagged as part of a cycle it collects
 * neighboring volumes (reuses `CycleLookupService`) and materializes them as REAL
 * database rows (`Kategoria=Tom cyklu`, `Cykl`/`CyklNr` fields). This lets volumes be
 * tagged (read/owned) and scanned on Vinted — previously they sat in a
 * blob and couldn't be tagged (option A chosen by the user).
 *
 * Idempotent: an existing row (by normalized title) is not duplicated, only
 * tagged with `Cykl`/`CyklNr` if it lacked them. A cycle is processed once, even
 * when it has several award anchors.
 */
export class CycleHarvestService {
  constructor(
    private notion: NotionAdapter,
    private cycleLookup: CycleLookupService,
    private config: ConfigService,
  ) {}

  async runCycleHarvest(sendEvent: (data: SyncEvent) => void, checkCancellation: () => boolean): Promise<void> {
    try {
      sendEvent({ type: "status", message: "Sprawdzanie struktury bazy Notion..." });
      await this.notion.createColumnIfNeeded("Kategoria", "select");
      await this.notion.createColumnIfNeeded("Cykl", "rich_text");
      await this.notion.createColumnIfNeeded("CyklNr", "number");
      await this.notion.createColumnIfNeeded("Część cyklu", "checkbox");

      sendEvent({ type: "status", message: "Pobieranie listy książek z Notion..." });
      const books: NotionBook[] = await this.notion.getBooksForStats(undefined, checkCancellation, { cache: true });

      // Index of existing rows by normalized title (Polish + original) — so we don't
      // create duplicates and can tag existing entries with the Cykl field.
      // Index by the SAME normalization as the cross-ref in lookup (normTitle) — otherwise
      // „inBase" from lookup and the match here diverge and we create a duplicate.
      const byTitle = new Map<string, NotionBook>();
      for (const b of books) {
        for (const t of [b.plTitle, b.origTitle]) if (t && t.trim()) byTitle.set(normTitle(t), b);
      }

      const cycleAnchors = books.filter((b) => b.currentCzesccyklu && !isCycleVolume(b));
      sendEvent({ type: "status", message: `Kotwic cyklu: ${cycleAnchors.length}. Odpytywanie Archiwum...` });
      if (cycleAnchors.length === 0) {
        sendEvent({ type: "complete", result: { success: true, found: 0, updated: 0 } });
        return;
      }

      const limit = pLimit(Math.min(3, Math.max(1, (await this.config.getConfig()).sync.writeConcurrency)));
      const processedCycles = new Set<string>(); // cycle names already expanded (dedup across anchors)
      const createdTitles: string[] = [];
      const taggedTitles: string[] = [];
      const noSiblingTitles: string[] = [];
      const errors: { book: string; error: string }[] = [];
      let processed = 0;

      const tasks = cycleAnchors.map((anchor) => limit(async () => {
        if (checkCancellation()) return;
        const anchorTitle = anchor.plTitle || anchor.origTitle;
        try {
          // Full coverage: walk far more of the chain than the preview, so a long cycle
          // isn't truncated at MAX_HOPS and left with unmaterialized volumes (backlog residuum).
          const view = await this.cycleLookup.lookup(anchorTitle, anchor.author || "", HARVEST_MAX_HOPS);
          if (!view || view.volumes.length <= 1) { noSiblingTitles.push(anchorTitle); return; }

          // Cycle name determined ONCE and sanitized — same as when creating the row,
          // otherwise the `existing.cykl !== …` guard would compare raw vs sanitized and
          // rewrite Cykl every run.
          const cyc = sanitizeNotionString(view.cycleName);
          const cycleKey = normTitle(cyc);
          // A cycle is expanded once — another anchor of the same cycle only gets tagged.
          if (cycleKey && processedCycles.has(cycleKey)) return;
          if (cycleKey) processedCycles.add(cycleKey);

          let nr = 0;
          for (const vol of view.volumes) {
            if (checkCancellation()) return;
            const title = (vol.title || "").trim();
            if (!title) continue;              // skip empty titles (no junk row)
            nr++;
            const key = normTitle(title);
            const existing = byTitle.get(key);
            if (existing && !existing.id) {
              // Reservation by another task (row being created) — don't duplicate.
              continue;
            } else if (existing) {
              // A real row exists — tag Cykl/CyklNr (don't duplicate). For cycle-volume
              // rows also normalize Lp and the link; award anchors (number in Lp) are NOT touched.
              const props: Record<string, any> = {};
              if (existing.cykl !== cyc || existing.cyklNr !== nr) {
                props["Cykl"] = { rich_text: [{ text: { content: cyc } }] };
                props["CyklNr"] = { number: nr };
              }
              if (isCycleVolume(existing)) {
                const label = cycleLpLabel(cyc, nr);
                if (existing.lp !== label) props["Lp"] = { title: [{ text: { content: label } }] };
                const wantLink = encyclopediaUrl(existing.plTitle || title);
                const curLink = existing.plTitleRichText?.[0]?.text?.link?.url;
                if (curLink !== wantLink) props["Tytuł polski"] = buildCycleTitleProperty(existing.plTitle || title);
              }
              if (Object.keys(props).length > 0) {
                await this.notion.updatePage(existing.id, props);
                taggedTitles.push(`${existing.plTitle || existing.origTitle} (${cyc} ${nr})`);
                existing.cykl = cyc; existing.cyklNr = nr;
                if (isCycleVolume(existing)) existing.lp = cycleLpLabel(cyc, nr);
              }
            } else {
              // No row — RESERVE the slot SYNCHRONOUSLY (before await), then create it.
              // A parallel task will see the reservation (id="") and skip this title.
              const reserved = { id: "", plTitle: title, origTitle: "", cykl: cyc, cyklNr: nr } as NotionBook;
              byTitle.set(key, reserved);
              const created = await this.notion.addRow(buildCycleVolumeProperties({
                title, author: anchor.author, cycleName: cyc, nr,
              }));
              reserved.id = created?.id ?? "";
              createdTitles.push(`${title} (${cyc})`);
            }
          }
        } catch (err: any) {
          errors.push({ book: anchorTitle, error: err?.message || String(err) });
        } finally {
          processed++;
          if (processed % 5 === 0 || processed === cycleAnchors.length) {
            sendEvent({ type: "progress", current: processed, total: cycleAnchors.length, message: `Rozwinięto ${processed}/${cycleAnchors.length} kotwic...` });
          }
        }
      }));

      await Promise.all(tasks);

      log.info("Żniwa cykli (wiersze) zakończone", { anchors: cycleAnchors.length, created: createdTitles.length, tagged: taggedTitles.length, noSiblings: noSiblingTitles.length, errors: errors.length });
      sendEvent({
        type: "complete",
        result: {
          success: !checkCancellation(),
          found: cycleAnchors.length,
          added: createdTitles.length,          // new cycle-volume rows
          updated: taggedTitles.length,         // existing entries attached to a cycle / Lp migration
          summary: {
            added: createdTitles,               // „Nowe Zapisy" panel
            updated: taggedTitles,              // „Zaktualizowane" panel
            skipped: noSiblingTitles,           // „Pominięte" panel — anchors with no neighboring volumes
          },
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error: any) {
      sendEvent({ type: "error", error: error.message });
    }
  }
}
