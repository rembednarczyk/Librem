import React, { useState } from "react";
import { motion } from "motion/react";
import { BookMarked, Award, Tag } from "lucide-react";
import { BookIndexEntry } from "../../types";
import { HighlightedText } from "./HighlightedText";
import { CycleTile } from "../CycleTile";
import { BookDetailPanel } from "./BookDetailPanel";
import { AnchorRect } from "../../utils/popoverPosition";

/** Source tag color — consistent visual language with the rest of the app. */
function zrodloTheme(tag: string): string {
  const t = tag.toLowerCase();
  if (t.includes("posiadam")) return "bg-emerald-500/10 border-emerald-500/25 text-emerald-300";
  if (t.includes("przeczytane")) return "bg-cyan-500/10 border-cyan-500/25 text-cyan-300";
  if (t.includes("biblioteka")) return "bg-blue-500/10 border-blue-500/25 text-blue-300";
  if (t.includes("vinted")) return "bg-rose-500/10 border-rose-500/25 text-rose-300";
  return "bg-slate-500/10 border-slate-500/25 text-slate-400";
}

/** „Nagroda" vs „Nominacja" — gold for a win, cooler for a nomination. */
function awardTheme(award: string): string {
  return award.toLowerCase().startsWith("nagroda")
    ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
    : "bg-purple-500/10 border-purple-500/25 text-purple-300";
}

interface Props {
  book: BookIndexEntry;
  query: string;
}

export const BookResultCard: React.FC<Props> = ({ book, query }) => {
  // Primary title = Polish, and when missing — the original (untranslated books).
  const primaryTitle = book.plTitle?.trim() ? book.plTitle : book.origTitle;
  const showOrig = book.origTitle && book.origTitle.trim() && book.origTitle !== primaryTitle;

  // Book-detail popover (cover + blurb from the encyclopedia), opened from the icon.
  const [detailAnchor, setDetailAnchor] = useState<AnchorRect | null>(null);
  const openDetail = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setDetailAnchor({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="glass-card rounded-3xl p-5 border-cyan-500/10 hover:border-cyan-500/25 transition-colors group"
    >
      {detailAnchor && (
        <BookDetailPanel
          title={primaryTitle}
          author={book.author || ""}
          year={book.year}
          series={book.series}
          anchor={detailAnchor}
          onClose={() => setDetailAnchor(null)}
        />
      )}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={openDetail}
          className="shrink-0 mt-0.5 p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/15 text-cyan-400/80 hover:bg-cyan-500/20 hover:text-cyan-200 hover:border-cyan-400/40 transition-colors cursor-pointer"
          title="Pokaż okładkę i opis z Encyklopedii"
          aria-label={`Pokaż szczegóły „${primaryTitle}"`}
        >
          <BookMarked className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <HighlightedText
              text={primaryTitle}
              query={query}
              className="result-title text-base font-bold text-slate-100 leading-tight"
            />
            <CycleTile title={primaryTitle} author={book.author || ""} partOfCycle={book.partOfCycle} />
          </div>

          {showOrig && (
            <HighlightedText
              text={book.origTitle}
              query={query}
              className="block text-xs text-slate-500 italic mt-0.5"
            />
          )}

          <div className="text-[11px] text-slate-400 uppercase font-bold tracking-[0.15em] mt-1.5">
            <HighlightedText text={book.author || "—"} query={query} />
            {book.year ? <span className="text-slate-500"> · {book.year}</span> : null}
            {book.series ? <span className="text-slate-500 normal-case tracking-normal italic"> · {book.series}</span> : null}
          </div>

          {book.awards.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              <Award className="w-3 h-3 text-amber-400/60 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {book.awards.map((a, i) => (
                  <span key={`a${i}`} className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${awardTheme(a)}`}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {book.zrodlo.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <Tag className="w-3 h-3 text-slate-500 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {book.zrodlo.map((z, i) => (
                  <span key={`z${i}`} className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${zrodloTheme(z)}`}>
                    {z}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
