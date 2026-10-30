import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * A stand-in for the Radix popover, for tests: like its dropdown menu (see plainDropdown),
 * jsdom takes many seconds to place Radix's floating panel, which says nothing about the
 * app (it opens at once in a browser). Use with
 *   vi.mock("@/components/ui/popover", () => import("./plainPopover"));
 * Open and closed are the caller's, as with a controlled Radix popover. Like Radix, the panel
 * goes to the page's body, not where it's written: a panel written inside a drawing (an
 * <svg>) would otherwise make its form fields SVG elements, which can't be typed in.
 */

const Open = createContext(false);

export const Popover = ({ open = false, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode }) =>
  <Open.Provider value={open}>{children}</Open.Provider>;

export const PopoverAnchor = ({ children }: { children: ReactElement }) => children;
export const PopoverTrigger = ({ children }: { children: ReactElement }) => children;

export const PopoverContent = ({ children, "aria-label": label }: { children: ReactNode; "aria-label"?: string; [k: string]: unknown }) =>
  useContext(Open) ? createPortal(<div role="dialog" aria-label={label}>{children}</div>, document.body) : null;
