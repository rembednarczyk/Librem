import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { BookMarked, X, Loader2, ExternalLink, ImageOff } from "lucide-react";
import { useBookDetail } from "../../hooks/useBookDetail";
import { encyclopediaUrl } from "../../utils/encyclopedia";
import { computePopoverPosition, AnchorRect } from "../../utils/popoverPosition";

/**
 * Book-detail preview popover: cover + blurb from the encyclopedia, on demand.
 * Same mechanics as `CyclePanel` — portal into `document.body` (escape ancestor
 * transforms), anchored at the click point, closes on Esc / outside click / scroll.
 * The cover `<img>` loads straight from the encyclopedia (allowed in `img-src`);
 * a missing or broken image degrades to a placeholder, never an empty box.
 */
interface Props {
  title: string;
  author: string;
  /** DB context shown in the header without a fetch. */
  year?: string | number | null;
  series?: string;
  /** Scanned ISBN — the panel then shows that exact edition's cover, not the newest. */
  isbn?: string;
  anchor: AnchorRect;
  onClose: () => void;
}

export const BookDetailPanel: React.FC<Props> = ({ title, author, year, series, isbn, anchor, onClose }) => {
  const { detail, loading, error, fetchDetail } = useBookDetail();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => { fetchDetail(title, author, isbn); }, [title, author, isbn, fetchDetail]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onShift = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onShift);
    window.addEventListener("scroll", onShift, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onShift);
      window.removeEventListener("scroll", onShift, true);
    };
  }, [onClose]);

  const pos = useMemo(
    () => computePopoverPosition(anchor, { width: window.innerWidth, height: window.innerHeight }),
    [anchor],
  );

  const hasCover = !!detail?.coverUrl && !imgFailed;
  // The cover shown is the newest edition (or the ISBN-matched one) — caption it so
  // it's clear which edition, and how many the encyclopedia lists.
  const editionCaption = detail
    ? [detail.editionYear, detail.editionsCount > 1 ? `${detail.editionsCount} wyd.` : ""].filter(Boolean).join(" · ")
    : "";
  const meta: string[] = [];
  if (detail?.publisher) meta.push(detail.publisher);
  if (detail?.translator) meta.push(`tłum. ${detail.translator}`);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} aria-hidden="true" />
      <motion.div
        role="dialog"
        aria-label={`Szczegóły: ${title}`}
        initial={{ opacity: 0, scale: 0.98, y: pos.placement === "below" ? -4 : 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.14 }}
        style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        className="z-[100] glass-card rounded-2xl border-cyan-500/20 flex flex-col overflow-hidden shadow-2xl shadow-slate-950/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2.5 p-3.5 border-b border-white/5 shrink-0">
          <div className="shrink-0 p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/25 text-cyan-300">
            <BookMarked className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold font-display uppercase tracking-widest text-cyan-300 truncate">{title}</h3>
            <p className="text-[10px] text-slate-500 truncate">
              {author || "—"}{year ? ` · ${year}` : ""}{series ? ` · ${series}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors shrink-0" aria-label="Zamknij">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3.5">
          {loading && (
            <div className="flex items-center justify-center gap-2.5 py-8 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span className="text-xs uppercase tracking-widest font-bold">Wczytywanie...</span>
            </div>
          )}

          {error && !loading && (
            <p className="text-xs text-slate-400 italic text-center py-8">{error}</p>
          )}

          {detail && !loading && (
            <div className="space-y-3">
              <div className="flex gap-3.5">
                {/* Cover (newest edition) + edition caption, or a placeholder. */}
                <div className="shrink-0 flex flex-col gap-1 items-center">
                  <div className="w-[96px] h-[140px] rounded-lg overflow-hidden border border-white/10 bg-slate-950/60 flex items-center justify-center">
                    {hasCover ? (
                      <img
                        src={detail.coverUrl}
                        alt={`Okładka: ${title}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setImgFailed(true)}
                      />
                    ) : (
                      <ImageOff className="w-6 h-6 text-slate-600" aria-label="Brak okładki" />
                    )}
                  </div>
                  {editionCaption && (
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider tabular-nums">{editionCaption}</span>
                  )}
                  {detail.coverSource === "isbn-match" && (
                    <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider">✓ zeskanowane wyd.</span>
                  )}
                </div>

                {/* Edition meta + link */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  {meta.length > 0 ? (
                    <ul className="space-y-1">
                      {meta.map((m, i) => (
                        <li key={i} className="text-[11px] text-slate-300 leading-snug">{m}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">Brak danych o wydaniu.</p>
                  )}
                  {detail.coverArtist && (
                    <p className="text-[10px] text-slate-500">okładka: {detail.coverArtist}</p>
                  )}
                  <a
                    href={encyclopediaUrl(title)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400 hover:text-cyan-300 transition-colors"
                    title="Otwórz w Encyklopedii (nowa karta)"
                  >
                    <ExternalLink className="w-3 h-3" /> Encyklopedia
                  </a>
                </div>
              </div>

              {detail.description ? (
                <p className="text-[12px] text-slate-300 leading-relaxed">{detail.description}</p>
              ) : (
                <p className="text-[11px] text-slate-500 italic">Brak opisu.</p>
              )}

              <p className="text-[9px] text-slate-600 text-center pt-0.5">
                Dane pobrane z Encyklopedii na żądanie — nie zapisujemy ich w bazie.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </>,
    document.body,
  );
};
