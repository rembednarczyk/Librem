// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { WikiParser } from "../wiki.parser";
import { CycleLookupService } from "../services/cycleLookupService";
import { NotionAdapter } from "../notion.adapter";
import { WikiAdapter } from "../wiki.adapter";

describe("WikiParser.extractCycleInfo", () => {
  it("reads cykl / poprzednia / następna from the {{Książka}} infobox", () => {
    const wt = `{{Książka
| tytuł = Gildia Orędowników
| cykl = [[Childe]]
| poprzednia = [[Młody Bleys]]
| następna = Gra Endera
}}`;
    const info = WikiParser.extractCycleInfo(wt);
    expect(info.cycleName).toBe("Childe");
    expect(info.prev).toBe("Młody Bleys");
    expect(info.next).toBe("Gra Endera");
  });

  it("tolerates the accent-less 'nastepna' spelling and empty fields", () => {
    expect(WikiParser.extractCycleInfo("| nastepna = Tom 2").next).toBe("Tom 2");
    expect(WikiParser.extractCycleInfo("| poprzednia = \n| cykl = X")).toMatchObject({ cycleName: "X", prev: null });
  });

  it("harvests wikilinks from a {{Cykl}} navigation template in order", () => {
    const wt = `{{Cykl|[[Diuna]]|[[Mesjasz Diuny]]|[[Dzieci Diuny]]}}`;
    expect(WikiParser.extractCycleInfo(wt).templateVolumes).toEqual(["Diuna", "Mesjasz Diuny", "Dzieci Diuny"]);
  });

  it("returns empty for a page with no cycle markers", () => {
    expect(WikiParser.extractCycleInfo("{{Książka|tytuł=Solaris}}")).toEqual({ cycleName: "", prev: null, next: null, templateVolumes: [] });
  });
});

describe("CycleLookupService.lookup", () => {
  const page = (over: Record<string, string>) =>
    "{{Książka\n" + Object.entries(over).map(([k, v]) => `| ${k} = ${v}`).join("\n") + "\n}}";

  const makeWiki = (pages: Record<string, string>) => ({
    fetchPageContent: vi.fn(async (t: string) => pages[t] || ""),
    searchPage: vi.fn(async () => []),
  }) as unknown as WikiAdapter;

  const makeNotion = (books: any[]) => ({
    getBooksForStats: vi.fn(async () => books),
  }) as unknown as NotionAdapter;

  it("walks the prev/next chain into an ordered volume list and cross-refs the base", async () => {
    const wiki = makeWiki({
      "Tom 1": page({ cykl: "Saga", następna: "Tom 2" }),
      "Tom 2": page({ cykl: "Saga", poprzednia: "Tom 1", następna: "Tom 3" }),
      "Tom 3": page({ cykl: "Saga", poprzednia: "Tom 2" }),
    });
    const notion = makeNotion([
      { id: "a", plTitle: "Tom 1", origTitle: "", zrodlo: ["Posiadam"], awards: [] },
      { id: "b", plTitle: "Tom 2", origTitle: "", zrodlo: ["Przeczytane", "Posiadam"], awards: ["Nagroda Hugo"] },
      // Tom 3 not in the base
    ]);
    const svc = new CycleLookupService(notion, wiki);
    const view = await svc.lookup("Tom 2", "");
    expect(view).not.toBeNull();
    expect(view!.cycleName).toBe("Saga");
    expect(view!.volumes.map((v) => v.title)).toEqual(["Tom 1", "Tom 2", "Tom 3"]);
    const [v1, v2, v3] = view!.volumes;
    expect(v1).toMatchObject({ owned: true, read: false, isCurrent: false, inBase: true });
    expect(v2).toMatchObject({ read: true, awarded: true, isCurrent: true });
    expect(v3).toMatchObject({ inBase: false, read: false });
    expect(view!.source).toBe("chain");
  });

  it("counts unread volumes before the current one (reading order gap)", async () => {
    const wiki = makeWiki({
      "T1": page({ cykl: "S", następna: "T2" }),
      "T2": page({ cykl: "S", poprzednia: "T1", następna: "T3" }),
      "T3": page({ cykl: "S", poprzednia: "T2" }),
    });
    const notion = makeNotion([{ id: "1", plTitle: "T1", origTitle: "", zrodlo: [], awards: [] }]);
    const svc = new CycleLookupService(notion, wiki);
    const view = await svc.lookup("T3", "");
    expect(view!.unreadBefore).toBe(2); // T1 and T2 unread
  });

  it("names a nameless (chain-only) cycle by its first volume, not the generic 'Cykl'", async () => {
    // A prev/next chain WITHOUT a |cykl= field — cycleName used to fall back to „Cykl", which made
    // all nameless cycles merge into one group and get skipped in the harvest.
    const wiki = makeWiki({
      "Alfa": page({ następna: "Beta" }),
      "Beta": page({ poprzednia: "Alfa" }),
    });
    const svc = new CycleLookupService(makeNotion([]), wiki);
    const view = await svc.lookup("Beta", "");
    expect(view!.cycleName).toBe("Alfa"); // the first volume's title, stable between anchors
  });

  it("returns null when the book is not part of any cycle", async () => {
    const wiki = makeWiki({ "X": page({ tytuł: "X" }) });
    const svc = new CycleLookupService(makeNotion([]), wiki);
    expect(await svc.lookup("X", "")).toBeNull();
  });

  it("caches the result (single resolve per title+author)", async () => {
    const wiki = makeWiki({ "T1": page({ cykl: "S", następna: "T2" }), "T2": page({ cykl: "S", poprzednia: "T1" }) });
    const svc = new CycleLookupService(makeNotion([]), wiki);
    await svc.lookup("T1", "");
    const calls = (wiki.fetchPageContent as any).mock.calls.length;
    await svc.lookup("T1", "");
    expect((wiki.fetchPageContent as any).mock.calls.length).toBe(calls); // no new fetches
  });

  it("truncates a long chain at the default hop cap but covers it with a larger maxHops", async () => {
    // A 20-volume linear chain anchored at Tom 1. Default cap (15) walks forward 15
    // → Tom 1..Tom 16 (16). A larger cap covers the whole cycle.
    const N = 20;
    const pages: Record<string, string> = {};
    for (let i = 1; i <= N; i++) {
      const fields: Record<string, string> = { cykl: "Długa Saga" };
      if (i > 1) fields.poprzednia = `Tom ${i - 1}`;
      if (i < N) fields.następna = `Tom ${i + 1}`;
      pages[`Tom ${i}`] = page(fields);
    }
    const svc = new CycleLookupService(makeNotion([]), makeWiki(pages));

    const preview = await svc.lookup("Tom 1", "");            // default MAX_HOPS = 15
    expect(preview!.volumes.length).toBe(16);                 // Tom 1 + 15 forward hops

    const harvest = await svc.lookup("Tom 1", "", 40);        // full coverage
    expect(harvest!.volumes.length).toBe(N);
    expect(harvest!.volumes[N - 1].title).toBe("Tom 20");
  });
});
