import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { Layers, X, Loader2, Check, Package, Award, CircleDashed, MapPin, AlertTriangle, ExternalLink } from "lucide-react";
import { useCycle } from "../../hooks/useCycle";
import { usePopoverDismiss } from "../../hooks/usePopoverDismiss";
import { encyclopediaUrl } from "../../utils/encyclopedia";
import { computePopoverPosition, AnchorRect } from "../../utils/popoverPosition";

/**
 * Cycle preview popover, anchored „at the click point" (anchor = trigger
 * rectangle). Rendered THROUGH A PORTAL into `document.body` to escape ancestor
 * transforms (framer-motion) — otherwise `position: fixed` would be relative to the card,
 * not the viewport (the popover landed in the middle of a long list / got clipped). Height
 * adapts to the number of volumes up to the available space; a longer list scrolls.
 */

const STATUS = (v: { read: boolean; owned: boolean; inBase: boolean }) => {
  if (v.read) return { icon: Check, cls: "text-cyan-400", label: "przeczytana" };
  if (v.owned) return { icon: Package, cls: "text-emerald-400", label: "posiadana" };
  if (v.inBase) return { icon: CircleDashed, cls: "text-slate-400", label: "w bazie" };
  return { icon: AlertTriangle, cls: "text-amber-400", label: "brak w bazie" };
};

interface Props {
  title: string;
  author: string;
  /** Trigger rectangle (getBoundingClientRect) — popover anchor. */
  anchor: AnchorRect;
  onClose: () => void;
}

export const CyclePanel: React.FC<Props> = ({ title, author, anchor, onClose }) => {
  const { view, loading, error, fetchCycle } = useCycle();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchCycle(title, author); }, [title, author, fetchCycle]);
  // Esc / outside-scroll / resize close; scrolling the content keeps it open.
  usePopoverDismiss(panelRef, onClose);

  const pos = useMemo(
    () => computePopoverPosition(anchor, { width: window.innerWidth, height: window.innerHeight }),
    [anchor],
  );

  return createPortal(
    <>
      {/* Transparent catcher for clicks outside the popover (tooltip feel — no dimming). */}
      <div className="fixed inset-0 z-[99]" onClick={onClose} aria-hidden="true" />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-label={`Cykl: ${view?.cycleName || title}`}
        initial={{ opacity: 0, scale: 0.98, y: pos.placement === "below" ? -4 : 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.14 }}
        style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        className="z-[100] glass-card rounded-2xl border-amber-500/20 flex flex-col overflow-hidden shadow-2xl shadow-slate-950/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2.5 p-3.5 border-b border-white/5 shrink-0">
          <div className="shrink-0 p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-300">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold font-display uppercase tracking-widest text-amber-300 truncate">
              {view?.cycleName || "Cykl"}
            </h3>
            <p className="text-[10px] text-slate-500 truncate">{title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors shrink-0" aria-label="Zamknij">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center gap-2.5 py-8 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span className="text-xs uppercase tracking-widest font-bold">Wczytywanie cyklu...</span>
            </div>
          )}

          {error && !loading && (
            <p className="text-xs text-slate-400 italic text-center py-8">{error}</p>
          )}

          {view && !loading && (
            <>
              {view.unreadBefore > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Przed tą pozycją masz <b>{view.unreadBefore}</b> {view.unreadBefore === 1 ? "nieprzeczytany tom" : "nieprzeczytane tomy"} — warto nadrobić dla fabuły.</span>
                </div>
              )}

              <ol className="space-y-1.5">
                {view.volumes.map((v, i) => {
                  const s = STATUS(v);
                  const Icon = s.icon;
                  return (
                    <li
                      key={i}
                      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                        v.isCurrent ? "bg-cyan-500/10 border-cyan-500/30" : "bg-slate-950/40 border-white/5"
                      }`}
                    >
                      <span className="text-[10px] font-bold tabular-nums text-slate-500 w-4 text-right shrink-0">{i + 1}.</span>
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${s.cls}`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-[13px] truncate block ${v.isCurrent ? "text-cyan-200 font-bold" : v.inBase ? "text-slate-200" : "text-slate-400"}`}>
                          {v.title}
                          {v.isCurrent && <MapPin className="inline w-3 h-3 ml-1 text-cyan-400" />}
                        </span>
                      </div>
                      {v.awarded && <Award className="w-3 h-3 text-amber-400 shrink-0" aria-label="nagrodzona" />}
                      <span className={`text-[9px] uppercase tracking-wider font-bold shrink-0 ${s.cls}`}>{s.label}</span>
                      <a
                        href={encyclopediaUrl(v.title)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 p-1 rounded-md text-slate-500 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                        title="Otwórz w Encyklopedii (nowa karta)"
                        aria-label={`Otwórz „${v.title}" w Encyklopedii`}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                  );
                })}
              </ol>

              <p className="text-[9px] text-slate-600 text-center pt-0.5">
                Dane pobrane z Encyklopedii na żądanie — nie zapisujemy ich w bazie.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </>,
    document.body,
  );
};
