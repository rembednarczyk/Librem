import { useState, useCallback } from "react";
import type { IdentifiedBooks } from "../types/stats";
import { markReadRequest } from "../utils/http";
import { useReadStateNotifier } from "../contexts/ReadStateContext";

type BookRef = { id: string; title: string; author: string; year?: number | null };

const LIBRARY_TAGS = ["Biblioteka", "Biblioteka 9"];

interface Deps {
  identifiedBooks: IdentifiedBooks;
  addBookToLibrarySection: (tag: string, book: BookRef) => void;
  fetchStats: () => Promise<void>;
}

/**
 * Marking an item as read (`POST /api/mark-as-read`).
 * `markingId` blocks parallel writes; `markedIds` (key „{tag}:{pageId}")
 * holds items tagged in this session — the library scan excludes already
 * tagged books, so the record should stay visible but with its checkbox off.
 *
 * tag defaults to „Przeczytane" (owned resources / library stats);
 * the branch scanner passes a branch tag („Biblioteka" / „Biblioteka 9").
 */
export function useMarkAsRead({ identifiedBooks, addBookToLibrarySection, fetchStats }: Deps) {
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const notifyReadChange = useReadStateNotifier();

  const markAsRead = useCallback(async (pageId: string, tag?: string) => {
    if (markingId) return;
    setMarkingId(pageId);
    try {
      await markReadRequest(pageId, tag, true, "Błąd podczas oznaczania pozycji");
      const sourceTag = tag ?? "Przeczytane";
      setMarkedIds(prev => new Set(prev).add(`${sourceTag}:${pageId}`));

      // A branch tag adds the item only to the „Książki dostępne w
      // bibliotekach" section — we update it optimistically (immediately, resilient to
      // Notion's read lag) and DON'T publish: a forced refetch could race Notion
      // and revert the optimistic row, and a branch tag crosses no other widget.
      // „Przeczytane" changes many cross-sections (authors, chronology, owned) and
      // also „Cykle", so we publish — every read-state widget refreshes itself.
      if (LIBRARY_TAGS.includes(sourceTag)) {
        const book = Object.values(identifiedBooks).flat().find(b => b.id === pageId);
        if (book) addBookToLibrarySection(sourceTag, book);
        else await fetchStats();
      } else {
        notifyReadChange();
      }
    } catch (err: any) {
      console.error(err.message);
      alert(`Błąd: ${err.message}`);
    } finally {
      setMarkingId(null);
    }
  }, [markingId, identifiedBooks, addBookToLibrarySection, fetchStats, notifyReadChange]);

  return { markingId, markedIds, markAsRead };
}
