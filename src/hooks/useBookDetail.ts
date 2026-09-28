import { useState, useCallback, useRef } from "react";

export interface BookDetail {
  title: string;
  coverUrl: string;
  editionYear: string;
  editionsCount: number;
  coverSource: "newest" | "isbn-match" | "infobox";
  description: string;
  translator: string;
  publisher: string;
  coverArtist: string;
  firstPolish: string;
}

/**
 * On-demand book-detail preview (GET /api/book-detail) — cover + blurb from the
 * encyclopedia. Cache per (title|author) in a ref, so reopening the popover for the
 * same book doesn't re-query; the backend caches too. Mirrors `useCycle`.
 */
export function useBookDetail() {
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Map<string, BookDetail | null>>(new Map());

  const fetchDetail = useCallback(async (title: string, author: string, isbn?: string) => {
    const key = `${title}|${author}|${isbn || ""}`;
    setError(null);
    if (cache.current.has(key)) { setDetail(cache.current.get(key)!); return; }
    setLoading(true);
    setDetail(null);
    try {
      const isbnParam = isbn ? `&isbn=${encodeURIComponent(isbn)}` : "";
      const res = await fetch(`/api/book-detail?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author || "")}${isbnParam}`);
      if (res.status === 404) { cache.current.set(key, null); setDetail(null); setError("Nie znaleziono tej książki w Encyklopedii."); return; }
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error || `Błąd serwera: ${res.status}`); }
      const data: BookDetail = await res.json();
      cache.current.set(key, data);
      setDetail(data);
    } catch (e: any) {
      setError(e?.message || "Nie udało się pobrać szczegółów.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { detail, loading, error, fetchDetail };
}
