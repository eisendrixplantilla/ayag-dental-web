import { cloneElement, createContext, useContext, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";

/*
 * A stand-in for the Radix dropdown menu, for tests: jsdom takes ~30s to lay out Radix's
 * floating menu, which says nothing about the app (it opens instantly in a browser). Use with
 *   vi.mock("@/components/ui/dropdown-menu", () => import("./plainDropdown"));
 * The trigger opens and closes it; items are role="menuitem" and run their onClick.
 */

type Ctx = { open: boolean; setOpen: (o: boolean) => void };
const MenuCtx = createContext<Ctx>({ open: false, setOpen: () => {} });

export const DropdownMenu = ({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode }) => {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (o: boolean) => { onOpenChange?.(o); if (open === undefined) setInner(o); };
  return <MenuCtx.Provider value={{ open: isOpen, setOpen }}>{children}</MenuCtx.Provider>;
};

export const DropdownMenuTrigger = ({ children }: { children: ReactElement }) => {
  const { open, setOpen } = useContext(MenuCtx);
  return cloneElement(children, {
    onClick: () => setOpen(!open),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter") setOpen(!open); },
  });
};

export const DropdownMenuContent = ({ children }: { children: ReactNode }) =>
  useContext(MenuCtx).open ? <div role="menu">{children}</div> : null;

export const DropdownMenuItem = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => {
  const { setOpen } = useContext(MenuCtx);
  return <div role="menuitem" onClick={() => { onClick?.(); setOpen(false); }}>{children}</div>;
};

export const DropdownMenuSeparator = () => <hr />;
export const DropdownMenuLabel = ({ children }: { children: ReactNode }) => <>{children}</>;
