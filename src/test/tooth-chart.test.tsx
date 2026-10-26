import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { DentalRecord } from "@/lib/api/dentalRecords";
import { formatTeeth, parseTeeth } from "@/lib/teeth";

const h = vi.hoisted(() => ({ records: [] as Partial<DentalRecord>[], asked: [] as unknown[] }));
vi.mock("@/lib/api/dentalRecords", () => ({
  getDentalRecords: vi.fn(async (filters: unknown) => { h.asked.push(filters); return h.records; }),
}));

import ToothChart from "@/components/ToothChart";

const record = (id: string, date: string, toothNumber: string, procedure: string): Partial<DentalRecord> =>
  ({ id, date, toothNumber, diagnosis: "Caries", treatments: [{ id: "t", serviceId: null, serviceName: procedure }], prescriptions: [] });

/** The chart in a form, so clicks show up as they would on the page. */
function Form({ start = "", patientId }: { start?: string; patientId?: string }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <ToothChart value={value} onChange={setValue} patientId={patientId} />
      <output data-testid="saved">{value}</output>
    </>
  );
}
const tooth = (n: number) => screen.getByRole("button", { name: `Tooth ${n}` });
const saved = () => screen.getByTestId("saved").textContent;

afterEach(() => { cleanup(); h.records = []; h.asked = []; });

describe("reading and writing a Tooth No.", () => {
  it("finds the chart's teeth in what was typed before", () => {
    expect(parseTeeth("36")).toEqual([36]);
    expect(parseTeeth("26, 16 & 16")).toEqual([16, 26]);
    expect(parseTeeth("upper molars")).toEqual([]);
    expect(parseTeeth("19, 55")).toEqual([55]); // 19 isn't a tooth
  });

  it("saves them in chart order", () => {
    expect(formatTeeth([26, 11, 16])).toBe("16, 11, 26");
  });
});

describe("the dental chart", () => {
  it("picks and unpicks the teeth the procedure was done on", () => {
    render(<Form />);
    fireEvent.click(tooth(26));
    fireEvent.click(tooth(16));
    expect(saved()).toBe("16, 26");
    expect(tooth(16)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(tooth(26));
    expect(saved()).toBe("16");
    expect(tooth(26)).toHaveAttribute("aria-pressed", "false");
  });

  it("picks with the keyboard too", () => {
    render(<Form />);
    fireEvent.keyDown(tooth(36), { key: "Enter" });
    fireEvent.keyDown(tooth(46), { key: " " });
    expect(saved()).toBe("46, 36");
  });

  it("switches to baby teeth for a child", () => {
    render(<Form />);
    expect(screen.queryByRole("button", { name: "Tooth 55" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Child (baby teeth)" }));
    fireEvent.click(tooth(55));
    expect(saved()).toBe("55");
    expect(screen.queryByRole("button", { name: "Tooth 16" })).toBeNull();
  });

  it("opens on baby teeth when the record already has some", () => {
    render(<Form start="74" />);
    expect(tooth(74)).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the teeth done before, and says what and when", async () => {
    h.records = [
      record("r1", "2026-09-01", "36", "Root Canal"),
      record("r2", "2026-10-02", "36, 11", "Restoration"),
    ];
    render(<Form patientId="p1" />);
    await waitFor(() => expect(tooth(36)).toHaveAttribute("data-done-before"));
    expect(h.asked).toEqual([{ patientId: "p1" }]);
    expect(tooth(11)).toHaveAttribute("data-done-before");
    expect(tooth(16)).not.toHaveAttribute("data-done-before");

    // Pointing at it shows the same in a tooltip (checked in the browser; jsdom can't place one).
    expect(tooth(36)).toHaveAccessibleDescription(
      "Done before: Oct 2, 2026: Restoration; Sep 1, 2026: Root Canal", // newest first
    );
    expect(tooth(16)).not.toHaveAccessibleDescription();
  });

  it("asks for no history without a patient account", () => {
    render(<Form />);
    expect(h.asked).toEqual([]);
  });

  it("only shows the teeth when there's nothing to change", () => {
    render(<ToothChart value="16, 26" />);
    expect(tooth(16).querySelector("path")!.getAttribute("class")).toContain("fill-primary");
    expect(tooth(16)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(tooth(16)); // nothing to change
    expect(tooth(16).querySelector("path")!.getAttribute("class")).toContain("fill-primary");
    expect(screen.getByText("16, 26")).toBeInTheDocument();
  });
});
