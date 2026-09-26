import { useState, useRef, useCallback } from "react";
import { BookIndexEntry } from "../types";
import { ReadOverrides } from "../utils/bookshelf";
import { useMarkRead } from "./useMarkRead";
import { useShelfOrder } from "./useShelfOrder";
import { useReadStateNotifier } from "../contexts/ReadStateContext";

/** One row of a precise-drop order plan (from `planInsertion`). */
export interface OrderChange {
  pageId: string;
  order: number;
}

/**
 * Optimistic shelf writes with rollback, kept out of BookshelfSection so the
 * component only renders and wires callbacks. Owns:
 *  - the „przeczytane" overrides + a SERIALIZED, latest-wins-per-book save queue
 *    (the backend `mutateMultiSelect` is a non-atomic retrieve→modify→update, so
 *    overlapping writes of one book could read the same state and drift Notion),
 *  - the manual-order overrides + optimistic `saveOrders` with rollback,
 *  - the shared `moveError` surfaced on a failed save.
 */
export function useShelfMutations() {
  const { setRead } = useMarkRead();
  const { saveOrders } = useShelfOrder();
  const notifyReadChange = useReadStateNotifier();

  const [overrides, setOverrides] = useState<ReadOverrides>({});
  const [orderOverrides, setOrderOverrides] = useState<Record<string, number>>({});
  const [moveError, setMoveError] = useState<string | null>(null);

  // pendingRef holds the freshest requested state per book; runningRef — books with an active runner.
  const pendingRef = useRef<Record<string, boolean>>({});
  const runningRef = useRef<Set<string>>(new Set());

  /** Optimistic „przeczytane" change + serialized save (latest-wins per book). */
  const applyReadChange = useCallback((book: BookIndexEntry, targetRead: boolean) => {
    setOverrides((prev) => ({ ...prev, [book.id]: targetRead }));
    setMoveError(null);

    // Store the freshest requested state; if this book's runner is already running, it will pick it up itself.
    pendingRef.current[book.id] = targetRead;
    if (runningRef.current.has(book.id)) return;
    runningRef.current.add(book.id);
    void (async () => {
      try {
        while (book.id in pendingRef.current) {
          const desired = pendingRef.current[book.id];
          delete pendingRef.current[book.id];
          await setRead(book.id, desired);
          // Publish so any co-mounted read-state widget refreshes. Today the shelf
          // is on its own tab (no subscriber mounted) and stays optimistic; this
          // keeps the invariant „every successful read write publishes".
          notifyReadChange();
        }
      } catch (e: any) {
        // Save didn't go through — revert to the DB state and show the error.
        delete pendingRef.current[book.id];
        setOverrides((prev) => { const next = { ...prev }; delete next[book.id]; return next; });
        setMoveError(`Nie udało się zapisać „${book.plTitle || book.origTitle}": ${e.message}`);
      } finally {
        runningRef.current.delete(book.id);
      }
    })();
  }, [setRead, notifyReadChange]);

  /** Optimistic manual-order change (precise drop) + `saveOrders` with rollback. */
  const applyOrderPlan = useCallback((book: BookIndexEntry, orders: OrderChange[]) => {
    if (orders.length === 0) return;
    setOrderOverrides((prev) => {
      const next = { ...prev };
      for (const o of orders) next[o.pageId] = o.order;
      return next;
    });
    void (async () => {
      try {
        await saveOrders(orders);
      } catch (e: any) {
        setOrderOverrides((prev) => {
          const next = { ...prev };
          for (const o of orders) delete next[o.pageId];
          return next;
        });
        setMoveError(`Nie udało się zapisać pozycji „${book.plTitle || book.origTitle}": ${e.message}`);
      }
    })();
  }, [saveOrders]);

  return { overrides, orderOverrides, moveError, setMoveError, applyReadChange, applyOrderPlan };
}
