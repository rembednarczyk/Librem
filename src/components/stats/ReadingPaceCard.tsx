import React from "react";
import { motion } from "motion/react";
import { Gauge, Crown, ArrowUp, ArrowDown, Minus, Flame } from "lucide-react";
import { ReadingStats } from "../../hooks/useStats";

/**
 * „Tempo czytania" — reading pace over award books by the YEAR each was marked
 * read („Data przeczytania"). Year-granular by design: historical dates are often
 * year-only (see `computeReadingStats`), so we never pretend to month precision.
 * KPI tiles (this year + delta, recent pace, record year) over a yearly histogram;
 * bar height = books read that year, current year and record year highlighted.
 */
export const ReadingPaceCard: React.FC<{ reading: ReadingStats }> = ({ reading }) => {
  const { perYear, thisYear, lastYear, bestYear, recentPace, totalRead, totalDated, streaks } = reading;
  const max = Math.max(1, ...perYear.map((y) => y.count));
  const currentYear = new Date().getFullYear();
  const delta = thisYear - lastYear;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.24 }}
      className="glass-card p-6 rounded-3xl border-amber-500/10 space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold font-display uppercase tracking-widest text-amber-400 flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          Tempo czytania
        </h3>
        {bestYear && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
            <Crown className="w-3.5 h-3.5" /> Rekord: {bestYear.count} w {bestYear.year}
          </span>
        )}
      </div>

      {totalDated === 0 ? (
        <p className="text-slate-400 text-sm italic text-center py-8">
          Brak dat przeczytania. Oznaczaj książki jako „Przeczytane", by zbierać tempo.
        </p>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-900/40 border border-slate-700/40 p-3 text-center">
              <div className="text-2xl font-bold font-display text-cyan-300 tabular-nums flex items-center justify-center gap-1.5">
                {thisYear}
                {delta !== 0 && (
                  <span className={`text-xs flex items-center ${delta > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                    {delta > 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                    {Math.abs(delta)}
                  </span>
                )}
                {delta === 0 && lastYear > 0 && <Minus className="w-3.5 h-3.5 text-slate-600" />}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1">W tym roku</div>
            </div>
            <div className="rounded-2xl bg-slate-900/40 border border-slate-700/40 p-3 text-center">
              <div className="text-2xl font-bold font-display text-amber-300 tabular-nums">{recentPace}</div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1">Książek / rok</div>
            </div>
            <div className="rounded-2xl bg-slate-900/40 border border-slate-700/40 p-3 text-center">
              <div className="text-2xl font-bold font-display text-slate-200 tabular-nums">{totalDated}</div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1">Z datą łącznie</div>
            </div>
          </div>

          {/* Reading streaks — consecutive read-years. Only when there's a real run. */}
          {streaks.longest >= 2 && (
            <div className="flex items-center justify-center gap-x-5 gap-y-1.5 flex-wrap text-[11px] font-bold">
              {streaks.current >= 2 && (
                <span className="flex items-center gap-1.5 text-orange-300">
                  <Flame className="w-3.5 h-3.5" /> Seria {streaks.current} {streaks.current === 1 ? "rok" : streaks.current < 5 ? "lata" : "lat"} z rzędu
                </span>
              )}
              <span className="flex items-center gap-1.5 text-slate-400 uppercase tracking-widest">
                Rekord serii: <span className="text-slate-200 tabular-nums normal-case tracking-normal">{streaks.longest} lat ({streaks.longestFrom}–{streaks.longestTo})</span>
              </span>
            </div>
          )}

          {/* Yearly histogram — bar = books read that year */}
          <div className="flex items-end gap-1 h-[140px] pt-2">
            {perYear.map((y) => {
              const h = (y.count / max) * 100;
              const isCurrent = y.year === currentYear;
              const isBest = bestYear?.year === y.year;
              return (
                <div key={y.year} className="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0 group">
                  <span className="text-[9px] text-slate-500 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{y.count}</span>
                  <div className="w-full flex-1 flex items-end" style={{ minHeight: 1 }}>
                    <div
                      className={`w-full rounded-t-[3px] ${
                        isBest ? "bg-gradient-to-t from-amber-500 to-amber-400"
                          : isCurrent ? "bg-gradient-to-t from-cyan-500 to-cyan-300"
                          : "bg-gradient-to-t from-cyan-600/70 to-cyan-500/70"
                      }`}
                      style={{ height: `${Math.max(h, 3)}%` }}
                      title={`${y.year}: przeczytane ${y.count}`}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 tabular-nums whitespace-nowrap">{`'${String(y.year % 100).padStart(2, "0")}`}</span>
                </div>
              );
            })}
          </div>

          {/* Footer note — honesty about dated coverage */}
          <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/70" /> Przeczytane / rok</span>
            {totalDated < totalRead && (
              <span className="text-slate-400 tabular-nums normal-case tracking-normal">{totalDated}/{totalRead} przeczytanych ma datę</span>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};
