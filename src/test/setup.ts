import { vi } from "vitest";
import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom can't place a tooltip: once one opens (hover, or a test focusing its button) its
// positioning never settles and the test hangs. The tooltip only adds a hint on top of the
// element, so tests get the element alone. ToothChart and DentistCards use Radix directly
// and are tested without opening theirs.
vi.mock("@/components/Hint", () => ({ default: ({ children }: { children: unknown }) => children }));

// The app's date and month pickers open a positioned panel, which jsdom can't place
// either. Pages are tested with a plain input in their place, set like the native one
// was (fireEvent.change); date-picker.test.tsx tests the real pickers.
vi.mock("@/components/DatePicker", async () => {
  const React = await import("react");
  const field = (type: string) => ({ value, onChange, placeholder: _p, required: _r, ...rest }: any) =>
    React.createElement("input", { ...rest, type, value, onChange: (e: any) => onChange(e.target.value) });
  return { DatePicker: field("date"), MonthPicker: field("month") };
});
