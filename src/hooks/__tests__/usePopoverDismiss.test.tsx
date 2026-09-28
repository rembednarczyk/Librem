import React, { useRef } from "react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { usePopoverDismiss } from "../usePopoverDismiss";

const Probe: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  usePopoverDismiss(ref, onClose);
  return (
    <div>
      <div ref={ref} data-testid="popover">
        <button data-testid="inner">x</button>
      </div>
      <div data-testid="outside">y</div>
    </div>
  );
};

describe("usePopoverDismiss", () => {
  let onClose: Mock<() => void>;
  beforeEach(() => { onClose = vi.fn<() => void>(); render(<Probe onClose={onClose} />); });

  it("closes on Escape", () => {
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when scrolling inside the popover (content scrolls)", () => {
    fireEvent.scroll(screen.getByTestId("inner"));
    fireEvent.scroll(screen.getByTestId("popover"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a scroll outside the popover (stale anchor)", () => {
    fireEvent.scroll(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on window resize", () => {
    fireEvent(window, new Event("resize"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    fireEvent.keyDown(window, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
