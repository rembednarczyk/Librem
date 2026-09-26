import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, render, act } from "@testing-library/react";
import { ReadStateProvider, useReadStateListener, useReadStateNotifier } from "../ReadStateContext";

const wrap = ({ children }: { children: React.ReactNode }) => <ReadStateProvider>{children}</ReadStateProvider>;

describe("ReadStateContext", () => {
  it("delivers a notify to every subscribed listener", () => {
    const a = vi.fn(), b = vi.fn();
    const { result } = renderHook(() => {
      useReadStateListener(a);
      useReadStateListener(b);
      return useReadStateNotifier();
    }, { wrapper: wrap });

    act(() => result.current());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("always calls the latest callback (ref-backed, no stale closure)", () => {
    const first = vi.fn(), second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => { useReadStateListener(cb); return useReadStateNotifier(); },
      { wrapper: wrap, initialProps: { cb: first } },
    );
    rerender({ cb: second });
    act(() => result.current());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after a listener unmounts", () => {
    const listener = vi.fn();
    let notify: () => void = () => {};
    const Notifier: React.FC = () => { notify = useReadStateNotifier(); return null; };
    const Subscriber: React.FC = () => { useReadStateListener(listener); return null; };

    const { rerender } = render(
      <ReadStateProvider><Notifier /><Subscriber /></ReadStateProvider>
    );
    act(() => notify());
    expect(listener).toHaveBeenCalledTimes(1);

    // Drop the subscriber; the bus (same provider instance) must forget it.
    rerender(<ReadStateProvider><Notifier /></ReadStateProvider>);
    act(() => notify());
    expect(listener).toHaveBeenCalledTimes(1); // no further delivery
  });

  it("one throwing listener does not stop the others", () => {
    const boom = vi.fn(() => { throw new Error("boom"); });
    const ok = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => {
      useReadStateListener(boom);
      useReadStateListener(ok);
      return useReadStateNotifier();
    }, { wrapper: wrap });

    act(() => result.current());
    expect(boom).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("is inert (no throw) without a provider", () => {
    const { result } = renderHook(() => {
      useReadStateListener(vi.fn());
      return useReadStateNotifier();
    });
    expect(() => act(() => result.current())).not.toThrow();
  });
});
