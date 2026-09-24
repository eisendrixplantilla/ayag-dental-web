import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real Settings page, with the network replaced. Adding a service is the only
// way a new treatment reaches the booking forms, so this covers that path.
const h = vi.hoisted(() => ({
  services: [] as any[],
  removed: [] as any[],
  created: [] as any[],
  removeCalls: [] as { id: string; reason: string; by?: string }[],
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
      return { ...gone, removedAt: "2026-09-24", removedBy: by ?? "Super Admin", removedReason: reason };
    }),
    restoreService: vi.fn(async (id: string) => {
      const back = h.removed.find((s: any) => s.id === id);
      return { ...back, removedAt: null, removedBy: null, removedReason: null };
    }),
    updateService: vi.fn(async () => h.services[0]),
    createService: vi.fn(async (input: any) => {
      if (h.failWith) throw new Error(h.failWith);
      h.created.push(input);
      return { id: `sv-${h.created.length}`, description: null, ...input };
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

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

beforeEach(() => {
  h.services = [{ id: "sv-oral", name: "Oral", description: null, duration: 30, price: 1500 }];
  h.removed = [];
  h.removeCalls = [];
  h.created = [];
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

  it("keeps the list in order, so a new service isn't stuck at the bottom", async () => {
    await openDialog();
    fireEvent.change(field(/Service Name/), { target: { value: "Braces" } });
    fireEvent.change(field(/Price/), { target: { value: "25000" } });
    submit();

    await waitFor(() => expect(screen.getByText("Braces")).toBeInTheDocument());
    const names = Array.from(document.querySelectorAll("tbody tr td:first-child")).map(c => c.textContent);
    expect(names).toEqual(["Braces", "Oral"]);
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
