import { RefObject, useEffect } from "react";

/**
 * Shared dismissal for an anchored popover (CyclePanel / BookDetailPanel …) — one
 * behaviour across the app:
 *  - Esc closes.
 *  - A resize, or a scroll OUTSIDE the popover, closes it: the popover is
 *    `position: fixed` at a click point, so once the page moves its anchor is stale.
 *  - A scroll INSIDE the popover does NOT close it — that's what lets its own content
 *    scroll (wheel, touch drag, scrollbar). Before this, the capture-phase scroll
 *    listener fired on inner scroll too, so the popover shut the moment you tried to
 *    scroll it.
 *
 * `scroll` doesn't bubble, but capture-phase listeners on `window` still receive it
 * from nested scrollers with `e.target` = the scrolled element — that's how we tell
 * inner scroll from page scroll.
 */
export function usePopoverDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onScroll = (e: Event) => {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return; // inner scroll → keep open
      onClose();
    };
    const onResize = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [ref, onClose]);
}
