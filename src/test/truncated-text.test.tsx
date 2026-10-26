import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TruncatedText from "@/components/TruncatedText";

// jsdom lays nothing out, so each test says how wide the text is and how much room it has.
function sized(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => scrollWidth });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => clientWidth });
}
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

describe("a reason kept to one line", () => {
  it("can be pointed at (and tabbed to) for the rest once it's cut short", () => {
    sized(400, 120);
    render(<TruncatedText text="for testiiiiiiiiiiiiiiiiiiiiiiiiiiiiiing" />);
    const text = screen.getByText("for testiiiiiiiiiiiiiiiiiiiiiiiiiiiiiing");
    expect(text).toHaveClass("truncate", "cursor-help");
    expect(text).toHaveAttribute("tabindex", "0");
  });

  it("is left alone when it fits", () => {
    sized(80, 120);
    render(<TruncatedText text="For Testing" />);
    const text = screen.getByText("For Testing");
    expect(text).toHaveClass("truncate");
    expect(text).not.toHaveClass("cursor-help");
    expect(text).not.toHaveAttribute("tabindex");
  });

  it("still offers its note when it fits", () => {
    sized(80, 120);
    render(<TruncatedText text="Seminar" more="Dental expo in Manila" />);
    expect(screen.getByText("Seminar")).toHaveAttribute("tabindex", "0");
  });
});
