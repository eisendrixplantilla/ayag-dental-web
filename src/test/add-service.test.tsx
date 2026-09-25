import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real Settings page, with the network replaced. Adding a service is the only
// way a new treatment reaches the booking forms, so this covers that path.
const h = vi.hoisted(() => ({
  services: [] as any[],
  removed: [] as any[],
  created: [] as any[],
  removeCalls: [] as { id: string; reason: string; by?: string }[],
  reordered: [] as string[][],
  failWith: null as string | null,
}));

vi.mock("@/lib/api/dentalRecords", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dentalRecords")>();
  return {
    ...actual,
    getServices: vi.fn(async () => h.services),
    getRemovedServices: vi.fn(async () => h.removed),
    removeService: vi.fn(async (id: string, reason: string, by?: string) => {
      h.removeCalls.push({ id, reason, by });
      const gone = h.services.find((s: any) => s.id === id);
      h.services = h.services.filter((s: any) => s.id !== id);
      return { ...gone, removedAt: "2026-09-24", removedBy: by ?? "Super Admin", removedReason: reason };
    }),
    restoreService: vi.fn(async (id: string) => {
      const back = h.removed.find((s: any) => s.id === id);
      h.removed = h.removed.filter((s: any) => s.id !== id);
      const restored = { ...back, removedAt: null, removedBy: null, removedReason: null };
      // Back where it was in the catalogue's own order.
      h.services = [...h.services, restored].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      return restored;
    }),
    updateService: vi.fn(async () => h.services[0]),
    createService: vi.fn(async (input: any) => {
      if (h.failWith) throw new Error(h.failWith);
      h.created.push(input);
      // A new service goes to the end of the catalogue, as the insert does.
      const created = { id: `sv-${h.created.length}`, description: null, ...input };
      h.services = [...h.services, created];
      return created;
    }),
    reorderServices: vi.fn(async (order: string[]) => {
      h.reordered.push(order);
      h.services = order
        .map((id) => h.services.find((s: any) => s.id === id))
        .filter(Boolean);
      return h.services;
    }),
  };
});

vi.mock("@/lib/api/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/settings")>();
  return {
    ...actual,
    getClinicHours: vi.fn(async () => [{ day: "Monday", open: "08:00", close: "17:00", enabled: true }]),
    getClinicInfo: vi.fn(async () => ({ name: "Ayag Dental Clinic", phone: "0917", email: "clinic@ayag.com", address: "Tuguegarao" })),
    updateClinicHours: vi.fn(async () => {}),
    updateClinicInfo: vi.fn(async () => ({})),
  };
});

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "su-1", name: "Super Administrator", role: "superadmin", email: "super@admin.com", verified: true } }),
  api: vi.fn(async () => ({})),
}));

import SuperAdminSettings from "@/pages/superadmin/SuperAdminSettings";

/** The service names in the order the table has them. */
const serviceNames = () =>
  Array.from(document.querySelectorAll("tbody tr"))
    .map(r => (r as HTMLTableRowElement).cells[1]?.textContent)
    .filter((n): n is string => !!n && n !== "No services found");

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

beforeEach(() => {
  h.services = [{ id: "sv-oral", name: "Oral", description: null, duration: 30, price: 1500 }];
  h.removed = [];
  h.removeCalls = [];
  h.created = [];
  h.reordered = [];
  h.failWith = null;
  toasts.success.mockClear();
  toasts.error.mockClear();
});

const openDialog = async () => {
  render(<SuperAdminSettings />);
  await screen.findByText("Oral");
  fireEvent.click(screen.getByRole("button", { name: /Add Service/ }));
  await screen.findByText("Add Dental Service");
};
// The table has its own per-row Duration/Price boxes, so look inside the dialog.
const dialog = () => document.querySelector("[role=dialog]") as HTMLElement;
const field = (label: RegExp) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const submit = () =>
  fireEvent.click(
    screen.getAllByRole("button", { name: /Add Service/ }).find(b => b.closest("[role=dialog]")) as HTMLElement,
  );

describe("adding a dental service", () => {
  it("offers the button and a form with a duration already suggested", async () => {
    await openDialog();

    expect(field(/Service Name/)).toHaveValue("");
    expect(field(/Duration/)).toHaveValue(30);
    expect(field(/Price/)).toHaveValue(null);
  });

  it("saves the service and shows it in the table straight away", async () => {
    await openDialog();
    fireEvent.change(field(/Service Name/), { target: { value: "  Fluoride Treatment  " } });
    fireEvent.change(field(/Duration/), { target: { value: "45" } });
    fireEvent.change(field(/Price/), { target: { value: "2000" } });
    submit();

    await waitFor(() => expect(h.created).toHaveLength(1));
    expect(h.created[0]).toEqual({ name: "Fluoride Treatment", duration: 45, price: 2000 }); // trimmed, as numbers
    await waitFor(() => expect(screen.getByText("Fluoride Treatment")).toBeInTheDocument());
    expect(screen.queryByText("Add Dental Service")).toBeNull(); // dialog closed
  });

  it("puts a new service at the end of the catalogue, to be dragged where it belongs", async () => {
    await openDialog();
    fireEvent.change(field(/Service Name/), { target: { value: "Braces" } });
    fireEvent.change(field(/Price/), { target: { value: "25000" } });
    submit();

    // The order is the Super Admin's, not the alphabet's, so nothing is inserted
    // into the middle of it on their behalf.
    await waitFor(() => expect(screen.getByText("Braces")).toBeInTheDocument());
    expect(serviceNames()).toEqual(["Oral", "Braces"]);
  });

  it("won't save without a name, minutes or a price", async () => {
    await openDialog();
    submit(); // nothing typed at all
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Enter the service name"));

    fireEvent.change(field(/Service Name/), { target: { value: "Fluoride" } });
    fireEvent.change(field(/Duration/), { target: { value: "" } });
    submit();
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Enter the minutes this service takes"));

    fireEvent.change(field(/Duration/), { target: { value: "45" } });
    submit();
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Enter a valid price"));

    expect(h.created).toHaveLength(0);
  });

  it("says so when the clinic already has that service", async () => {
    h.failWith = "A service with this name already exists";
    await openDialog();
    fireEvent.change(field(/Service Name/), { target: { value: "Oral" } });
    fireEvent.change(field(/Price/), { target: { value: "1500" } });
    submit();

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("A service with this name already exists"));
    expect(screen.getByText("Add Dental Service")).toBeInTheDocument(); // left open to correct
  });

  it("starts each new service with an empty form", async () => {
    await openDialog();
    fireEvent.change(field(/Service Name/), { target: { value: "Fluoride" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Add Dental Service")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Add Service/ }));
    await screen.findByText("Add Dental Service");
    expect(field(/Service Name/)).toHaveValue("");
  });
});

describe("removing a dental service", () => {
  const openRemove = async (name = "Oral") => {
    render(<SuperAdminSettings />);
    await screen.findByText(name);
    fireEvent.click(await screen.findByRole("button", { name: `Remove ${name}` }));
    await screen.findByText("Remove Dental Service");
  };
  const removeButton = () =>
    screen.getAllByRole("button", { name: /^Remove$/ }).find(b => b.closest("[role=dialog]")) as HTMLButtonElement;
  const reasonBox = () => within(dialog()).getByLabelText(/Reason for removing/);

  it("asks why, and won't remove until it's answered", async () => {
    await openRemove();

    expect(removeButton()).toBeDisabled();
    fireEvent.change(reasonBox(), { target: { value: "   " } });
    expect(removeButton()).toBeDisabled();

    fireEvent.change(reasonBox(), { target: { value: "Equipment retired" } });
    await waitFor(() => expect(removeButton()).not.toBeDisabled());
  });

  it("sends the reason and who removed it, and takes the service off the list", async () => {
    await openRemove();
    fireEvent.change(reasonBox(), { target: { value: "  Equipment retired  " } });
    fireEvent.click(removeButton());

    await waitFor(() => expect(h.removeCalls).toHaveLength(1));
    expect(h.removeCalls[0]).toEqual({ id: "sv-oral", reason: "Equipment retired", by: "Super Administrator" });

    // Gone from the bookable list, listed underneath with the reason.
    await waitFor(() => expect(screen.getByText("Removed Services")).toBeInTheDocument());
    expect(screen.getByText("Equipment retired")).toBeInTheDocument();
    expect(screen.getByText("Super Administrator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Oral" })).toBeNull();
  });

  it("shows what was removed earlier, and puts one back on request", async () => {
    h.services = [];
    h.removed = [{
      id: "sv-tmj", name: "TMJ", description: null, duration: 45, price: 5000,
      removedAt: "2026-09-20", removedBy: "Super Administrator", removedReason: "Referred out",
    }];
    render(<SuperAdminSettings />);

    await screen.findByText("Removed Services");
    expect(screen.getByText("Referred out")).toBeInTheDocument();
    expect(screen.getByText("2026-09-20")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore TMJ" }));
    await waitFor(() => expect(screen.queryByText("Removed Services")).toBeNull());
    expect(screen.getByRole("button", { name: "Remove TMJ" })).toBeInTheDocument();
  });

  it("keeps the removed list out of the way when nothing has been removed", async () => {
    render(<SuperAdminSettings />);
    await screen.findByText("Oral");
    expect(screen.queryByText("Removed Services")).toBeNull();
  });
});

describe("arranging the catalogue", () => {
  const catalogue = () => {
    h.services = [
      { id: "sv-a", name: "Braces", description: null, duration: 60, price: 25000, sortOrder: 1 },
      { id: "sv-b", name: "Cleaning", description: null, duration: 30, price: 1000, sortOrder: 2 },
      { id: "sv-c", name: "Extraction", description: null, duration: 45, price: 1500, sortOrder: 3 },
    ];
  };
  const handle = (name: string) => screen.getByRole("button", { name: new RegExp(`^Reorder ${name}`) });
  // jsdom has no drag implementation, so the events are dispatched directly — which is
  // all the page listens for anyway.
  const drag = (from: string, onto: string) => {
    fireEvent.dragStart(handle(from), { dataTransfer: { effectAllowed: "" } });
    const target = screen.getByText(onto).closest("tr")!;
    fireEvent.dragOver(target);
    fireEvent.drop(target);
  };

  it("drags a service to the top of the list, and saves that order", async () => {
    catalogue();
    render(<SuperAdminSettings />);
    await screen.findByText("Extraction");
    expect(serviceNames()).toEqual(["Braces", "Cleaning", "Extraction"]);

    drag("Extraction", "Braces");

    await waitFor(() => expect(serviceNames()).toEqual(["Extraction", "Braces", "Cleaning"]));
    // The new order is sent as the ids, top to bottom — not as one row's new index.
    expect(h.reordered).toEqual([["sv-c", "sv-a", "sv-b"]]);
    expect(toasts.success).toHaveBeenCalledWith("Moved Extraction to position 1");
  });

  it("moves a row with the arrow keys, for anyone not using a mouse", async () => {
    catalogue();
    render(<SuperAdminSettings />);
    await screen.findByText("Extraction");

    fireEvent.keyDown(handle("Cleaning"), { key: "ArrowUp" });
    await waitFor(() => expect(serviceNames()).toEqual(["Cleaning", "Braces", "Extraction"]));

    fireEvent.keyDown(handle("Cleaning"), { key: "ArrowDown" });
    await waitFor(() => expect(serviceNames()).toEqual(["Braces", "Cleaning", "Extraction"]));
  });

  it("stays put at the ends of the list, and when dropped on itself", async () => {
    catalogue();
    render(<SuperAdminSettings />);
    await screen.findByText("Extraction");

    fireEvent.keyDown(handle("Braces"), { key: "ArrowUp" });      // already first
    fireEvent.keyDown(handle("Extraction"), { key: "ArrowDown" }); // already last
    drag("Cleaning", "Cleaning");

    await waitFor(() => expect(serviceNames()).toEqual(["Braces", "Cleaning", "Extraction"]));
    expect(h.reordered).toEqual([]); // nothing moved, so nothing was saved
  });

  it("puts the list back when the order can't be saved", async () => {
    catalogue();
    render(<SuperAdminSettings />);
    await screen.findByText("Extraction");

    const { reorderServices } = await import("@/lib/api/dentalRecords");
    vi.mocked(reorderServices).mockRejectedValueOnce(new Error("Network is down"));

    drag("Extraction", "Braces");

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Network is down"));
    // What is on screen is never an order the clinic doesn't actually have.
    expect(serviceNames()).toEqual(["Braces", "Cleaning", "Extraction"]);
  });
});

describe("the reorder handle keeps the focus it is given", () => {
  it("stays focusable while a move is saving, so the next arrow key lands", async () => {
    h.services = [
      { id: "sv-a", name: "Braces", description: null, duration: 60, price: 25000, sortOrder: 1 },
      { id: "sv-b", name: "Cleaning", description: null, duration: 30, price: 1000, sortOrder: 2 },
    ];
    render(<SuperAdminSettings />);
    await screen.findByText("Cleaning");

    const handle = screen.getByRole("button", { name: /^Reorder Cleaning/ });
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowUp" });

    // Disabling it mid-move would hand the focus back to the body, and every arrow
    // press after the first would go nowhere.
    expect(handle).not.toBeDisabled();
    expect(document.activeElement).toBe(handle);

    await waitFor(() => expect(h.reordered).toEqual([["sv-b", "sv-a"]]));
    expect(document.activeElement).toBe(handle);
  });
});
