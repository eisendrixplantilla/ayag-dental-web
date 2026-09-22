import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

// A fake server behind the real `api()` call sites: the page, the appointments API
// module and describeEmailOutcome all run for real; only the network is replaced.
const h = vi.hoisted(() => ({
  appts: [] as Appointment[],
  emailSent: true as boolean | null,
  patches: [] as { id: string; body: Record<string, unknown> }[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1", name: "Dr. Sarah Chen", email: "admin@admin.com", role: "admin", verified: true } }),
  api: vi.fn(async (path: string, init: RequestInit = {}) => {
    if (!init.method || init.method === "GET") return { appointments: h.appts };
    if (init.method === "PATCH") {
      const id = new URL(path, "http://x").searchParams.get("id")!;
      const body = JSON.parse(String(init.body));
      h.patches.push({ id, body });
      h.appts = h.appts.map(a => (a.id === id ? { ...a, ...body } : a));
      return { appointment: h.appts.find(a => a.id === id), emailSent: h.emailSent };
    }
    throw new Error(`unexpected ${init.method} ${path}`);
  }),
}));

const toasts = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

import AdminOnlineAppointments from "@/pages/admin/AdminOnlineAppointments";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function apt(over: Partial<Appointment>): Appointment {
  return {
    id: "x", patientId: "p1", patientName: "Someone", contact: null, email: "patient@example.com",
    dentistId: "d1", dentistName: "Dr. Mike Johnson", service: "Oral",
    date: "2026-09-25", time: "13:00", endTime: null, type: "online", status: "pending",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient",
    createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
    ...over,
  };
}

const rowOf = (name: string) => screen.getByText(name).closest("tr")!;

beforeEach(() => {
  h.appts = [
    apt({ id: "pending-1", patientName: "Allen Estrella", email: "allen@example.com" }),
    apt({ id: "confirmed-1", patientName: "Pedro Reyes", status: "confirmed", time: "09:30" }),
  ];
  h.emailSent = true;
  h.patches = [];
  Object.values(toasts).forEach(fn => fn.mockClear());
});
afterEach(cleanup);

const renderPage = async () => {
  render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
  await screen.findByText("Allen Estrella");
};

describe("admin approve / reject", () => {
  it("offers Approve and Reject on pending bookings only, including the compact phone controls", async () => {
    await renderPage();
    const pending = within(rowOf("Allen Estrella"));
    // One labelled button (wide screens) and one icon button (phones) for each action.
    expect(pending.getAllByRole("button", { name: /Approve/ })).toHaveLength(2);
    expect(pending.getAllByRole("button", { name: /Reject/ })).toHaveLength(2);

    const confirmed = within(rowOf("Pedro Reyes"));
    expect(confirmed.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(confirmed.queryByRole("button", { name: /Reject/ })).toBeNull();
  });

  it("shows times in 12-hour format", async () => {
    await renderPage();
    expect(within(rowOf("Allen Estrella")).getByText("1:00 PM")).toBeInTheDocument();
    expect(within(rowOf("Pedro Reyes")).getByText("9:30 AM")).toBeInTheDocument();
  });

  it("approving confirms it, reports the email as sent, and removes the actions", async () => {
    await renderPage();
    fireEvent.click(within(rowOf("Allen Estrella")).getAllByRole("button", { name: /Approve/ })[1]); // phone icon

    await waitFor(() => expect(h.patches).toEqual([{ id: "pending-1", body: { status: "confirmed" } }]));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Appointment approved", {
      description: "Confirmation email sent to allen@example.com.",
    }));
    await waitFor(() => expect(within(rowOf("Allen Estrella")).getByText("confirmed")).toBeInTheDocument());
    expect(within(rowOf("Allen Estrella")).queryByRole("button", { name: /Approve/ })).toBeNull();
  });

  it("warns instead of claiming success when the email fails to send", async () => {
    h.emailSent = false;
    await renderPage();
    fireEvent.click(within(rowOf("Allen Estrella")).getAllByRole("button", { name: /Approve/ })[0]);

    await waitFor(() => expect(toasts.warning).toHaveBeenCalledWith("Appointment approved", {
      description: expect.stringContaining("couldn't be sent"),
    }));
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("rejecting requires a reason, sends it, and reports the email", async () => {
    await renderPage();
    fireEvent.click(within(rowOf("Allen Estrella")).getAllByRole("button", { name: /Reject/ })[1]);

    const dialog = await screen.findByRole("dialog");
    const send = within(dialog).getByRole("button", { name: /Reject & Notify/ });
    expect(send).toBeDisabled(); // no reason yet
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Dentist on leave that day" } });
    fireEvent.click(send);

    await waitFor(() => expect(h.patches).toEqual([
      { id: "pending-1", body: { status: "rejected", reason: "Dentist on leave that day" } },
    ]));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Appointment rejected", {
      description: "Rejection email sent to allen@example.com.",
    }));
  });
});
