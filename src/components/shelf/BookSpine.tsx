import React from "react";
import { BookIndexEntry } from "../../types";
import { SpineStyle, displayTitle, awardWins, spineFontSize } from "../../utils/bookshelf";
import { formatReadDate } from "../../utils/readDate";

interface Props {
  book: BookIndexEntry;
  style: SpineStyle;
  onDragStart: (book: BookIndexEntry) => void;
  onDragEnd: () => void;
}

/** Holo catalog signature (deterministic from id) — a digital detail on the spine. */
function catalogSig(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return "M" + (1000 + (h % 9000));
}

/** Book spine (concept A) — a draggable shelf element. */
export const BookSpine: React.FC<Props> = ({ book, style, onDragStart, onDragEnd }) => (
  <div
    draggable
    onDragStart={(e) => { e.dataTransfer.setData("text/plain", book.id); e.dataTransfer.effectAllowed = "move"; onDragStart(book); }}
    onDragEnd={onDragEnd}
    title={`${displayTitle(book)}${book.author ? " — " + book.author : ""}${book.year ? " (" + book.year + ")" : ""}${formatReadDate(book.dataPrzeczytania) ? " · przeczytano " + formatReadDate(book.dataPrzeczytania) : ""}`}
    className="book-spine group relative shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing select-none rounded-[3px_3px_1px_1px] transition-transform duration-150 hover:-translate-y-3"
    style={{
      width: style.width,
      height: style.height,
      ["--spine-muted" as string]: style.color,
      ["--spine-light" as string]: style.light,
      ["--spine-app" as string]: style.app,
      ["--spine-app-rgb" as string]: style.appRgb,
    } as React.CSSProperties}
  >
    <span className="absolute left-0 right-0 h-[10px] top-[9px] bg-black/25" aria-hidden />
    {style.width >= 26 && (
      <span
        className="absolute top-[3px] left-0 right-0 text-center font-mono pointer-events-none"
        style={{ fontSize: 6, letterSpacing: "0.03em", color: "rgba(var(--noo-glow),.85)", textShadow: "0 0 4px rgba(var(--noo-glow),.8)" }}
        aria-hidden
      >
        {catalogSig(book.id)}
      </span>
    )}
    <span
      className="spine-title font-bold whitespace-nowrap overflow-hidden max-h-[94%] py-1"
      style={{ fontSize: spineFontSize(style, displayTitle(book)), writingMode: "vertical-rl", transform: "rotate(180deg)" }}
    >
      {displayTitle(book)}
    </span>
    {(() => {
      const wins = awardWins(book);
      if (!wins.length) return null;
      return (
        <span className="absolute bottom-[6px] left-1/2 -translate-x-1/2 flex flex-col-reverse items-center gap-[3px]" title={wins.map((w) => w.label).join(" · ")}>
          {wins.map((w) => (
            <span key={w.key} className={`spine-award spine-award-${w.key} w-[8px] h-[8px] rounded-full`} style={{ background: w.color, boxShadow: `0 0 6px ${w.color}, 0 0 0 1px rgba(var(--noo-glow),.5)` }} />
          ))}
        </span>
      );
    })()}
  </div>
);
