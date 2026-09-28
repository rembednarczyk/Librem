import React, { useState, useMemo, useDeferredValue, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Loader2, ScrollText, AlertCircle, ScanBarcode, CheckCircle2, XCircle } from "lucide-react";
import { useBooks } from "../hooks/useBooks";
import { useIsbnLookup } from "../hooks/useIsbnLookup";
import { matchBooks, buildSearchVocab, didYouMean, replaceLastToken } from "../utils/bookSearch";
import { BookResultCard } from "./search/BookResultCard";
import { BookDetailPanel } from "./search/BookDetailPanel";
import { ScanModal } from "./search/ScanModal";
import { scanSupported, cleanScannedCode, matchIsbnInIndex } from "../utils/barcode";
import { AnchorRect } from "../utils/popoverPosition";

/** Max number of cards we render (DOM guard for an „empty" query = the whole set). */
const RENDER_CAP = 150;

export const SearchSection: React.FC = () => {
  // Full index (award books + cycle volumes) — so the scan/search finds a non-award volume too.
  const { books, loading, error, fetchBooks, refetchFresh } = useBooks(true);
  const { lookup } = useIsbnLookup();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  // Barcode scan: native BarcodeDetector is Android/Chrome only, so the button
  // shows only where it works (the modal keeps a manual-ISBN fallback regardless).
  const canScan = useMemo(() => scanSupported(), []);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResolving, setScanResolving] = useState(false);
  const scanBtnRef = useRef<HTMLButtonElement>(null);
  // Outcome banner after a scan: exact row hit (B), ISBN-resolved title (A), or miss.
  const [scanNotice, setScanNotice] = useState<{ kind: "exact" | "resolved" | "miss"; text: string } | null>(null);
  // Cover preview auto-opened after a hit — carries the SCANNED isbn so the panel
  // shows exactly the edition in your hand, not just the newest one.
  const [scanDetail, setScanDetail] = useState<{ title: string; author: string; isbn: string; anchor: AnchorRect } | null>(null);

  const anchorFromScanBtn = (): AnchorRect | null => {
    const el = scanBtnRef.current ?? inputRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width };
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // On mobile, start with a clean screen: books are loaded, but nothing is listed until you
  // type or scan (the empty-query browse-all is desktop-only). A scan/typed query fills it.
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const browseSuppressed = isMobile && !query.trim();

  // Turn a scanned/typed code into a search: first a direct row match by stored ISBN
  // (variant B), else resolve the ISBN → title server-side and fuzzy-search it (variant A).
  const handleScanDetect = async (rawCode: string) => {
    setScanOpen(false);
    setScanNotice(null);
    const code = cleanScannedCode(rawCode);
    if (!code) return;
    setScanResolving(true);
    try {
      // Match against a FRESH index, not the in-memory one: the ISBN may have been added
      // by the enrichment ritual after this page loaded (useBooks fetches only on mount),
      // so the cached list can be stale exactly for a just-enriched book.
      let index = books ?? [];
      try {
        index = await refetchFresh();
      } catch {
        // Network hiccup / timeout — fall back to the in-memory index.
      }

      const direct = matchIsbnInIndex(code, index);
      if (direct) {
        const t = direct.plTitle || direct.origTitle;
        setQuery(t);
        setScanNotice({ kind: "exact", text: `Znaleziono: „${t}"` });
        const anchor = anchorFromScanBtn();
        if (anchor) setScanDetail({ title: t, author: direct.author || "", isbn: code, anchor });
        return;
      }

      // Not stored on any row → resolve the ISBN to a title and fuzzy-search it (variant A).
      const book = await lookup(code);
      if (book?.title) {
        setQuery(book.title);
        setScanNotice({ kind: "resolved", text: `Rozpoznano przez ISBN: „${book.title}" — szukam w katalogu` });
        const anchor = anchorFromScanBtn();
        if (anchor) setScanDetail({ title: book.title, author: typeof book.author === "string" ? book.author : "", isbn: code, anchor });
      } else {
        setScanNotice({ kind: "miss", text: `Nie znaleziono w katalogu książki o ISBN ${code}.` });
      }
    } catch {
      setScanNotice({ kind: "miss", text: "Błąd rozpoznawania ISBN — spróbuj ponownie lub wpisz tytuł ręcznie." });
    } finally {
      setScanResolving(false);
      inputRef.current?.focus();
    }
  };

  const results = useMemo(() => matchBooks(deferredQuery, books ?? []), [deferredQuery, books]);
  const shown = browseSuppressed ? [] : results.slice(0, RENDER_CAP);
  const total = books?.length ?? 0;

  // „Czy chodziło Ci o…" — vocab computed once per set; suggestions only on 0 hits.
  const vocab = useMemo(() => buildSearchVocab(books ?? []), [books]);
  const suggestions = useMemo(
    () => (results.length === 0 && deferredQuery.trim() ? didYouMean(deferredQuery, vocab) : []),
    [results.length, deferredQuery, vocab]
  );

  return (
    <div className="space-y-8">
      {/* Section header */}
      <div className="flex items-center gap-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
        <div className="flex items-center gap-4">
          <ScrollText className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold font-display uppercase tracking-[0.4em] text-cyan-100/90 whitespace-nowrap">
            Katalog
          </h2>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
      </div>

      <p className="text-center text-[11px] text-slate-500 uppercase tracking-widest font-bold -mt-4">
        Szukaj po tytule, tytule oryginalnym lub autorze
      </p>

      {/* Search field */}
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400/50 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Wpisz fragment tytułu lub nazwisko autora…"
              aria-label="Przeszukaj katalog"
              className="w-full pl-14 pr-12 py-4 text-sm bg-slate-950/60 border border-white/10 text-slate-200 rounded-2xl focus:outline-none focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/5 placeholder-slate-500 transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors"
                title="Wyczyść"
                aria-label="Wyczyść zapytanie"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {canScan && (
            <button
              ref={scanBtnRef}
              onClick={() => setScanOpen(true)}
              disabled={scanResolving}
              title="Skanuj kod kreskowy książki"
              aria-label="Skanuj kod kreskowy"
              className="shrink-0 px-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/50 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center"
            >
              {scanResolving ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanBarcode className="w-5 h-5" />}
            </button>
          )}
        </div>

        {/* Scan outcome banner */}
        <AnimatePresence>
          {scanNotice && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium border ${
                scanNotice.kind === "miss"
                  ? "bg-red-500/10 border-red-500/30 text-red-300"
                  : "bg-cyan-500/10 border-cyan-500/30 text-cyan-200"
              }`}
            >
              {scanNotice.kind === "miss" ? <XCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span className="flex-1">{scanNotice.text}</span>
              <button onClick={() => setScanNotice(null)} className="p-0.5 opacity-60 hover:opacity-100" aria-label="Zamknij komunikat">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDetect={handleScanDetect} />

      {/* After a scan hit: the cover of the SCANNED edition (isbn passed through). */}
      {scanDetail && (
        <BookDetailPanel
          title={scanDetail.title}
          author={scanDetail.author}
          isbn={scanDetail.isbn}
          anchor={scanDetail.anchor}
          onClose={() => setScanDetail(null)}
        />
      )}

      {/* Counter (hidden on the mobile clean screen) */}
      {books && !loading && !browseSuppressed && (
        <p className="text-center text-xs text-slate-500 font-bold tracking-widest uppercase">
          {query.trim()
            ? `Znaleziono ${results.length} ${results.length === 1 ? "wolumin" : "woluminów"} z ${total}`
            : `${total} woluminów w katalogu`}
          {results.length > RENDER_CAP && ` · pokazano ${RENDER_CAP} — zawęź zapytanie`}
        </p>
      )}

      {/* States: loading / error / mobile clean screen / no hits / grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-widest">Wczytywanie zapisów…</span>
        </div>
      ) : error ? (
        <div className="glass-card p-6 rounded-3xl border-red-500/30 bg-red-500/5 max-w-xl mx-auto flex items-center gap-4">
          <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-bold">{error}</p>
            <button
              onClick={fetchBooks}
              className="mt-2 text-[11px] text-red-400/70 hover:text-red-300 uppercase tracking-widest font-bold"
            >
              Spróbuj ponownie
            </button>
          </div>
        </div>
      ) : browseSuppressed ? (
        <div className="text-center py-20 space-y-3">
          <ScanBarcode className="w-10 h-10 text-cyan-500/40 mx-auto" />
          <p className="text-sm text-slate-400 italic">
            {canScan ? "Zeskanuj kod kreskowy lub wpisz tytuł, aby przeszukać katalog." : "Wpisz tytuł lub nazwisko autora, aby przeszukać katalog."}
          </p>
          <p className="text-[11px] text-slate-600 uppercase tracking-widest font-bold">{total} woluminów w katalogu</p>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-sm text-slate-400 italic">
            {query.trim()
              ? `Brak wyników — żaden wolumin nie pasuje do „${query}".`
              : "Katalog jest pusty — brak rekordów do przeszukania."}
          </p>
          {query.trim() && suggestions.length > 0 && (
            <p className="text-sm text-slate-400">
              Czy chodziło Ci o:{" "}
              {suggestions.map((s, i) => (
                <React.Fragment key={s}>
                  <button
                    onClick={() => { setQuery(replaceLastToken(query, s)); inputRef.current?.focus(); }}
                    className="text-cyan-300 hover:text-cyan-200 font-semibold underline decoration-dotted underline-offset-4 decoration-cyan-500/50"
                  >
                    {s}
                  </button>
                  {i < suggestions.length - 1 ? <span className="text-slate-500">, </span> : <span className="text-slate-500">?</span>}
                </React.Fragment>
              ))}
            </p>
          )}
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {shown.map((book) => (
              <BookResultCard key={book.id} book={book} query={deferredQuery} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};
