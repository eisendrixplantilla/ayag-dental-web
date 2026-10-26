import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// setup.ts swaps the pickers for plain inputs on every page; here are the real ones. The
// popover is shown inline, since jsdom can't position it.
vi.unmock("@/components/DatePicker");
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/formatDate", async (orig) => ({
  ...(await orig<typeof import("@/lib/formatDate")>()),
  manilaTodayDateStr: () => "2026-10-26",
}));

import { DatePicker, MonthPicker } from "@/components/DatePicker";

afterEach(cleanup);

/** A day of the month on show (not the faded spill-over from the months either side). */
const day = (n: string) =>
  screen.getAllByRole("gridcell", { name: n }).find((d) => !d.className.includes("text-muted-foreground/50"))!;

describe("the month picker", () => {
  it("shows the month chosen and picks another from the year's twelve", () => {
    const onChange = vi.fn();
    render(<MonthPicker id="m" value="2026-10" onChange={onChange} />);
    expect(document.getElementById("m")).toHaveTextContent("October 2026");
    expect(screen.getByRole("button", { name: "October 2026", pressed: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    fireEvent.click(screen.getByRole("button", { name: "March 2025" }));
    expect(onChange).toHaveBeenCalledWith("2025-03");
  });

  it("can't go outside min and max", () => {
    render(<MonthPicker value="2026-10" min="2026-03" max="2026-11" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "February 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "March 2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "December 2026" })).toBeDisabled();
  });

  it("jumps by year through the year grid", () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2026-10" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^2026/ }));
    fireEvent.click(screen.getByRole("button", { name: "2019" }));
    fireEvent.click(screen.getByRole("button", { name: "July 2019" }));
    expect(onChange).toHaveBeenCalledWith("2019-07");
  });
});

describe("the date picker", () => {
  it("reads the date back and picks a day as yyyy-MM-dd", () => {
    const onChange = vi.fn();
    render(<DatePicker id="d" value="2026-10-05" onChange={onChange} />);
    expect(document.getElementById("d")).toHaveTextContent("Oct 5, 2026");
    fireEvent.click(day("12"));
    expect(onChange).toHaveBeenCalledWith("2026-10-12");
  });

  it("goes far back through months and years, for a birthday", () => {
    const onChange = vi.fn();
    render(<DatePicker value="" max="2026-10-26" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "October 2026" }));
    fireEvent.click(screen.getByRole("button", { name: /^2026/ }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Earlier years" }));
    fireEvent.click(screen.getByRole("button", { name: "1985" }));
    fireEvent.click(screen.getByRole("button", { name: "May 1985" }));
    fireEvent.click(day("14"));
    expect(onChange).toHaveBeenCalledWith("1985-05-14");
  });

  it("keeps days outside min and max from being picked", () => {
    render(<DatePicker value="2026-10-20" min="2026-10-10" max="2026-10-26" onChange={() => {}} />);
    expect(day("9")).toBeDisabled();
    expect(day("27")).toBeDisabled();
    expect(day("26")).toBeEnabled();
  });

  it("offers Today and Clear, but no Clear when a date is required", () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-10-05" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-10-26");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith("");

    cleanup();
    render(<DatePicker value="2026-10-05" required onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});
