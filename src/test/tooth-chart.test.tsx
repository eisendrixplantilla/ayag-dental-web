import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { DentalRecord, TreatmentEntry } from "@/lib/api/dentalRecords";
import { formatTeeth, parseTeeth, teethAfter } from "@/lib/teeth";
import { PROCEDURE_COLORS } from "@/lib/procedureColors";
import type { ToothCodes, ToothNotes } from "@/lib/toothCodes";

const h = vi.hoisted(() => ({ records: [] as Partial<DentalRecord>[], asked: [] as unknown[] }));
vi.mock("@/lib/api/dentalRecords", () => ({
  getDentalRecords: vi.fn(async (filters: unknown) => { h.asked.push(filters); return h.records; }),
  // The catalogue, in the Super Admin's order: each takes the next procedure colour.
  getServices: vi.fn(async () => [
    { id: "s1", name: "Oral", sortOrder: 1 },
    { id: "s2", name: "Root Canal", sortOrder: 2 },
    { id: "s3", name: "EXO (Bunot)", sortOrder: 3 },
  ]),
}));

vi.mock("@/components/ui/popover", () => import("./plainPopover"));

import ToothChart, { type ProcedureTeeth } from "@/components/ToothChart";

const record = (id: string, date: string, toothNumber: string, treatments: Partial<TreatmentEntry>[]): Partial<DentalRecord> =>
  ({ id, date, toothNumber, diagnosis: "Caries", treatments: treatments as TreatmentEntry[], prescriptions: [] });

/** The chart in a form, so changes show up as they would on the page. */
function Form({ start = [], value: startValue = "", patientId }: { start?: ProcedureTeeth[]; value?: string; patientId?: string }) {
  const [procedures, setProcedures] = useState<ProcedureTeeth[]>(start);
  const [value, setValue] = useState(startValue);
  const [codes, setCodes] = useState<ToothCodes>({});
  const [notes, setNotes] = useState<ToothNotes>({});
  return (
    <>
      <ToothChart procedures={procedures} value={value} codes={codes} notes={notes} patientId={patientId}
        onChange={(next) => { setProcedures(next.procedures); setValue(next.value); setCodes(next.codes); setNotes(next.notes); }} />
      <output data-testid="notes">{JSON.stringify(notes)}</output>
      <output data-testid="saved">{value}</output>
      <output data-testid="codes">{JSON.stringify(codes)}</output>
      <output data-testid="procedures">{procedures.map((p) => `${p.serviceName}=${p.teeth ?? ""}`).join(" | ")}</output>
    </>
  );
}
const tooth = (n: number) => screen.getByRole("button", { name: new RegExp(`^Tooth ${n}(:|$)`) });
const saved = () => screen.getByTestId("saved").textContent;
const procs = () => screen.getByTestId("procedures").textContent;
/** Opens a tooth's picker. */
async function picker(n: number) {
  fireEvent.click(tooth(n));
  return within(await screen.findByLabelText(`Chart codes for tooth ${n}`));
}
/** Opens a tooth's picker and taps a code in it ("D: Decayed (caries)"). */
async function tap(n: number, code: string) {
  fireEvent.click((await picker(n)).getByRole("button", { name: code }));
}

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

  it("keeps Tooth No. in step as procedures are renamed or removed, and keeps older loose teeth", () => {
    const before = [{ serviceName: "Oral", teeth: "16" }, { serviceName: "EXO", teeth: "26" }];
    // 36 was saved before procedures had teeth: it stays.
    expect(teethAfter("16, 26, 36", before, [{ serviceName: "Oral", teeth: "16" }])).toBe("16, 36");
    expect(teethAfter("16, 26", before, [...before, { serviceName: "Scaling", teeth: "11" }])).toBe("16, 11, 26");
  });
});

describe("the dental chart", () => {
  it("offers only the chart's codes on a tooth, not the services", async () => {
    render(<Form start={[{ serviceName: "Oral" }]} />);
    const codes = await picker(16);
    expect(codes.queryByRole("checkbox")).toBeNull();
    expect(codes.queryByText("Oral")).toBeNull();
    expect(codes.getByRole("group", { name: "Chart codes" })).toBeInTheDocument();
  });

  it("colours a tooth by its procedures, a slice for each, the same colour every time", async () => {
    render(<Form start={[{ serviceName: "Oral", teeth: "16" }, { serviceName: "Root Canal", teeth: "16" }, { serviceName: "EXO (Bunot)", teeth: "26" }]}
      value="16, 26" />);
    await waitFor(() => expect(tooth(16).querySelector("rect")!.getAttribute("fill")).toBe(PROCEDURE_COLORS[0]));
    const slices = [...tooth(16).querySelectorAll("rect")].map((r) => r.getAttribute("fill"));
    expect(slices).toEqual([PROCEDURE_COLORS[0], PROCEDURE_COLORS[1]]);
    expect(tooth(26).querySelector("rect")!.getAttribute("fill")).toBe(PROCEDURE_COLORS[2]);
    // The legend names each procedure and its teeth, so colour never says it alone.
    const legend = screen.getByRole("list", { name: "Procedures by tooth" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Oral16", "Root Canal16", "EXO (Bunot)26"]);
  });

  it("clears a tooth of an older record's procedures too", async () => {
    render(<Form start={[{ serviceName: "Oral", teeth: "16, 26" }, { serviceName: "Root Canal", teeth: "16" }]} value="16, 26" />);
    fireEvent.click((await picker(16)).getByRole("button", { name: "Clear tooth" }));
    expect(procs()).toBe("Oral=26 | Root Canal=");
    expect(saved()).toBe("26");
  });

  it("shows teeth saved with nothing on them as not recorded, until they're given a code", async () => {
    render(<Form start={[{ serviceName: "Oral" }]} value="36" />);
    expect(tooth(36)).toHaveAccessibleName("Tooth 36: procedure not recorded");
    expect(screen.getByText("Procedure not recorded")).toBeInTheDocument();
    await tap(36, "D: Decayed (caries)");
    expect(tooth(36)).toHaveAccessibleName("Tooth 36: D (Decayed (caries))");
    expect(saved()).toBe("36");
  });

  it("marks a tooth with the chart's codes, by group, in the list's order", async () => {
    render(<Form />);
    const codes = await picker(16);
    // Every code says what it means; the X-ray P is a different code from the Pontic P.
    fireEvent.click(codes.getByRole("button", { name: "Am: Amalgam filling" }));
    fireEvent.click(codes.getByRole("button", { name: "D: Decayed (caries)" }));
    fireEvent.click(codes.getByRole("button", { name: "P: Periapical X-ray" }));
    expect(codes.getByRole("button", { name: "D: Decayed (caries)" })).toHaveAttribute("aria-pressed", "true");
    expect(codes.getByRole("button", { name: "P: Pontic" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("codes").textContent).toBe(JSON.stringify({ 16: ["D", "Am", "XR-P"] }));
    expect(tooth(16)).toHaveAccessibleName("Tooth 16: D (Decayed (caries)), Am (Amalgam filling), P (Periapical X-ray)");
    // A tooth with codes is one of the visit's teeth.
    expect(saved()).toBe("16");
    expect(screen.getByRole("list", { name: "Chart codes by tooth" })).toHaveTextContent("16D, Am, P");
    // The tooth is coloured by its codes' groups, side by side.
    const colours = () => [...tooth(16).querySelectorAll("rect[data-group]")].map((r) => r.getAttribute("data-group"));
    expect(colours()).toEqual(["condition", "restoration", "xray"]);

    fireEvent.click(codes.getByRole("button", { name: "D: Decayed (caries)" }));
    expect(screen.getByTestId("codes").textContent).toBe(JSON.stringify({ 16: ["Am", "XR-P"] }));
    expect(colours()).toEqual(["restoration", "xray"]);
    fireEvent.click(codes.getByRole("button", { name: "Clear tooth" }));
    expect(screen.getByTestId("codes").textContent).toBe("{}");
    expect(saved()).toBe("");
  });

  it("says what a tapped code means, since a phone can't point at it for the tooltip", async () => {
    render(<Form />);
    const codes = await picker(16);
    expect(codes.getByText(/Tap a code to mark the tooth/)).toBeInTheDocument();
    fireEvent.click(codes.getByRole("button", { name: "MO: Missing due to other causes" }));
    expect(codes.getByText("· marked").closest("p")).toHaveTextContent("MO Missing due to other causes · marked");
    // While editing, the panel is the codes alone: no details box above them.
    expect(codes.queryByLabelText("About this tooth")).toBeNull();
  });

  it("opens a marked tooth's details on a tap, on a record that's only shown", async () => {
    h.records = [record("r1", "2026-09-01", "36", [{ serviceName: "Root Canal", teeth: "36" }])];
    render(<ToothChart procedures={[]} value="16" codes={{ 16: ["D", "Am"] }} patientId="p1" />);
    fireEvent.click(tooth(16));
    const panel = within(await screen.findByRole("dialog", { name: "Tooth 16" }));
    expect(panel.getByLabelText("About this tooth")).toHaveTextContent("D Decayed (caries)Am Amalgam filling");
    expect(panel.queryByRole("group", { name: "Chart codes" })).toBeNull(); // nothing to change here
    fireEvent.click(panel.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Tooth 16" })).toBeNull();

    await waitFor(() => expect(tooth(36)).toHaveAttribute("data-done-before"));
    fireEvent.click(tooth(36));
    expect(within(await screen.findByRole("dialog", { name: "Tooth 36" })).getByText("Sep 1, 2026: Root Canal")).toBeInTheDocument();
    // An unmarked tooth has nothing to say.
    fireEvent.click(tooth(21));
    expect(screen.queryByRole("dialog", { name: "Tooth 21" })).toBeNull();
  });

  it("shows a tooth's codes by its colour and in the list, not as letters beside it", () => {
    render(<ToothChart procedures={[]} value="13, 16" codes={{ 13: ["D", "Am", "Co", "X"], 16: ["D", "Am", "Co", "X"] }} />);
    // Only the tooth's number is printed by it.
    expect([...tooth(16).querySelectorAll("text")].map((t) => t.textContent)).toEqual(["16"]);
    // The codes are in the list under the chart.
    expect(screen.getByRole("list", { name: "Chart codes by tooth" })).toHaveTextContent("13D, Am, Co, X");
  });

  it("keeps a note on a tooth, shows it, and clears it with the tooth", async () => {
    render(<Form />);
    await picker(16);
    fireEvent.change(screen.getByRole("textbox", { name: "Note for tooth 16" }), { target: { value: "Sensitive to cold" } });
    expect(screen.getByTestId("notes").textContent).toBe(JSON.stringify({ 16: "Sensitive to cold" }));
    expect(saved()).toBe("16"); // a tooth with a note is one of the visit's teeth
    expect(tooth(16)).toHaveAttribute("data-note");
    expect(tooth(16)).toHaveAccessibleDescription("Note: Sensitive to cold.");
    expect(screen.getByRole("list", { name: "Chart codes by tooth" })).toHaveTextContent("16Sensitive to cold");

    // Emptying the box drops the note; Clear tooth does too.
    fireEvent.change(screen.getByRole("textbox", { name: "Note for tooth 16" }), { target: { value: "  " } });
    expect(screen.getByTestId("notes").textContent).toBe("{}");
    fireEvent.change(screen.getByRole("textbox", { name: "Note for tooth 16" }), { target: { value: "Chipped" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear tooth" }));
    expect(screen.getByTestId("notes").textContent).toBe("{}");
    expect(saved()).toBe("");
  });

  it("opens the picker with the keyboard too", async () => {
    render(<Form />);
    fireEvent.keyDown(tooth(36), { key: "Enter" });
    expect(await screen.findByLabelText("Chart codes for tooth 36")).toBeInTheDocument();
  });

  it("switches to baby teeth for a child", async () => {
    render(<Form />);
    expect(screen.queryByRole("button", { name: "Tooth 55" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Child (baby teeth)" }));
    await tap(55, "D: Decayed (caries)");
    expect(saved()).toBe("55");
    expect(screen.queryByRole("button", { name: /^Tooth 16/ })).toBeNull();
  });

  it("opens on baby teeth when the record already has some", () => {
    render(<Form start={[{ serviceName: "Oral", teeth: "74" }]} value="74" />);
    expect(tooth(74)).toHaveAccessibleName("Tooth 74: Oral");
  });

  it("marks the teeth done before, and says what was done on each and when", async () => {
    h.records = [
      record("r1", "2026-09-01", "36", [{ serviceName: "Root Canal" }]), // from before procedures had teeth
      record("r2", "2026-10-02", "36, 11", [{ serviceName: "Restoration", teeth: "36" }, { serviceName: "Scaling", teeth: "11" }]),
    ];
    render(<Form patientId="p1" />);
    await waitFor(() => expect(tooth(36)).toHaveAttribute("data-done-before"));
    expect(h.asked).toEqual([{ patientId: "p1" }]);
    expect(tooth(11)).toHaveAttribute("data-done-before");
    expect(tooth(16)).not.toHaveAttribute("data-done-before");

    // Pointing at it shows the same in a tooltip (checked in the browser; jsdom can't place one).
    expect(tooth(36)).toHaveAccessibleDescription(
      "Done before: Oct 2, 2026: Restoration; Sep 1, 2026: Root Canal", // newest first, each its own tooth's work
    );
    expect(tooth(11)).toHaveAccessibleDescription("Done before: Oct 2, 2026: Scaling");
    expect(tooth(16)).not.toHaveAccessibleDescription();
  });

  it("asks for no history without a patient account", () => {
    render(<Form />);
    expect(h.asked).toEqual([]);
  });

  it("only shows the teeth when there's nothing to change", () => {
    render(<ToothChart procedures={[{ serviceName: "Oral", teeth: "16, 26" }]} value="16, 26" />);
    expect(tooth(16)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(tooth(16)); // nothing to change, and no picker
    expect(screen.queryByLabelText("Chart codes for tooth 16")).toBeNull();
    expect(screen.getByRole("list", { name: "Procedures by tooth" })).toHaveTextContent("Oral16, 26");
  });
});
