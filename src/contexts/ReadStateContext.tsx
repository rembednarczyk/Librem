import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";

/**
 * A tiny pub/sub for one fact: „a book's read/owned tag just changed".
 *
 * The problem it solves: marking „Przeczytane"/„Posiadam" is reachable from
 * several widgets, each backed by its OWN data hook (`useStats`,
 * `useCyclesHarvest`, …). Before this, a mark in one refreshed only that widget,
 * so a book counted in both (e.g. an awarded cycle volume) went stale in the
 * other until a manual „Odśwież". Rather than wire every widget to every other,
 * each WRITE publishes `notifyReadChange()` and each READ widget subscribes its
 * own refetch — nobody needs to know the others exist, and a future widget opts
 * in with a single `useReadStateListener`.
 *
 * Deliberately a ref-backed Set, not React state: a state bump would re-render
 * the whole subtree under the provider; a ref set fires only the subscribers.
 *
 * Scope note — what does NOT belong on the bus:
 *  - Library branch tags („Biblioteka…") don't cross widgets and their write
 *    path is optimistic-only (Notion lags reads right after a write), so it must
 *    not publish — a forced refetch could revert the optimistic row.
 *  - The shelf's `useBooks` is optimistic and never co-mounted with these
 *    widgets, so it publishes (for uniformity) but does not subscribe — a
 *    subscription would refetch the whole index on every drag.
 */
type Listener = () => void;

interface ReadStateBus {
  notifyReadChange: () => void;
  subscribe: (fn: Listener) => () => void;
}

// Default = inert. Consumers rendered without a provider (unit tests, isolated
// mounts) get a no-op bus instead of throwing.
const NOOP_BUS: ReadStateBus = { notifyReadChange: () => {}, subscribe: () => () => {} };

const ReadStateContext = createContext<ReadStateBus>(NOOP_BUS);

export const ReadStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const listeners = useRef<Set<Listener>>(new Set());

  const notifyReadChange = useCallback(() => {
    // Iterate a snapshot: a listener that (un)subscribes mid-dispatch must not
    // mutate the set we're walking. One failing listener can't sink the rest.
    for (const fn of Array.from(listeners.current)) {
      try { fn(); } catch (e) { console.error("ReadState listener failed", e); }
    }
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  return (
    <ReadStateContext.Provider value={{ notifyReadChange, subscribe }}>
      {children}
    </ReadStateContext.Provider>
  );
};

/** Publish handle — call after a successful mark/unmark write. No provider = no-op. */
export function useReadStateNotifier(): () => void {
  return useContext(ReadStateContext).notifyReadChange;
}

/**
 * Subscribe a refetch to read-state changes. The callback is held in a ref so the
 * subscription is stable across renders (it never resubscribes when `onChange`
 * changes identity, and always calls the latest one).
 */
export function useReadStateListener(onChange: () => void): void {
  const { subscribe } = useContext(ReadStateContext);
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => subscribe(() => ref.current()), [subscribe]);
}
