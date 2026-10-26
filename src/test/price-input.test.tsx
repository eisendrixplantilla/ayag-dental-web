import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import PriceInput from "@/components/PriceInput";

afterEach(cleanup);

/** The field as a page uses it: it shows commas, the page keeps the plain number. */
function Field({ start = "" }: { start?: string }) {
  const [raw, setRaw] = useState(start);
  return (
    <>
      <PriceInput aria-label="Price" value={raw} onValueChange={setRaw} />
      <output>{raw}</output>
    </>
  );
}
const type = (text: string) => fireEvent.change(screen.getByLabelText("Price"), { target: { value: text } });

describe("a price field", () => {
  it("adds the commas as it's typed, keeping the plain number for saving", () => {
    render(<Field />);
    type("1500");
    expect(screen.getByLabelText("Price")).toHaveValue("1,500");
    expect(screen.getByRole("status")).toHaveTextContent("1500");
    type("1,2500000");
    expect(screen.getByLabelText("Price")).toHaveValue("12,500,000");
  });

  it("shows a saved price with commas", () => {
    render(<Field start="25000" />);
    expect(screen.getByLabelText("Price")).toHaveValue("25,000");
  });

  it("takes centavos, two at most, and nothing but digits", () => {
    render(<Field />);
    type("12000.505");
    expect(screen.getByLabelText("Price")).toHaveValue("12,000.50");
    type("abc75");
    expect(screen.getByLabelText("Price")).toHaveValue("75");
    type("");
    expect(screen.getByLabelText("Price")).toHaveValue("");
  });
});
