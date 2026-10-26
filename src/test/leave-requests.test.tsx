import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LeaveRequest } from "@/lib/api/leave";

const h = vi.hoisted(() => ({ leave: [] as LeaveRequest[], calls: [] as unknown[][] }));

vi.mock("@/lib/api/leave", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/leave")>();
  const record = (name: string) => vi.fn(async (...args: unknown[]) => { h.calls.push([name, ...args]); return h.leave[0]; });
  return {
    ...actual,
    getLeave: vi.fn(async () => h.leave),
    requestLeave: record("request"),
    cancelLeave: record("cancel"),
    approveLeave: record("approve"),
    rejectLeave: record("reject"),
    requestLeaveChange: record("change"),
    removeLeaveDays: record("removeDays"),
    shortenLeave: record("shorten"),
    cancelLeaveChange: record("withdraw"),
    approveLeaveChange: record("approveChange"),
    rejectLeaveChange: record("rejectChange"),
  };
});
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "dr-1", name: "Aerhol Gocalin", role: "dentist" } }), api: vi.fn() }));
// Radix Select can't be driven in jsdom; a plain <select> stands in, named by its trigger.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const items = (node: any): any[] =>
    React.Children.toArray(node).flatMap((c: any) =>
      c?.props?.value !== undefined ? [c] : c?.props?.children ? items(c.props.children) : []);
  const passthrough = ({ children }: any) => children ?? null;
  return {
    Select: ({ value, onValueChange, children }: any) => React.createElement("select", {
      "aria-label": (React.Children.toArray(children) as any[]).find((c) => c?.props?.["aria-label"])?.props["aria-label"],
      value,
      onChange: (e: any) => onValueChange(e.target.value),
    }, [
      React.createElement("option", { key: "__none", value: "" }, ""),
      ...items(children).map((i: any) => React.createElement("option", { key: i.props.value, value: i.props.value }, i.props.children)),
    ]),
    SelectTrigger: passthrough, SelectContent: passthrough, SelectItem: passthrough, SelectValue: () => null,
  };
});

import { DecideLeave, FileLeave, MyLeave, StaffLeave } from "@/components/LeaveRequests";
import { MemoryRouter } from "react-router-dom";

const leave = (over: Partial<LeaveRequest>): LeaveRequest => ({
  id: "l1", dentistId: "dr-1", dentistName: "Aerhol Gocalin", role: "dentist", startDate: "2026-11-03", endDate: "2026-11-05",
  reason: "Vacation", note: null, status: "pending", decidedBy: null, decidedAt: null, decisionReason: null, removedDates: [], changedBy: null, changedAt: null, startTime: null, endTime: null,
  createdAt: "2026-10-26T01:00:00Z", updatedAt: "2026-10-26T01:00:00Z", conflicts: [], ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T02:00:00Z"));
  h.leave = [];
  h.calls = [];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the leave card on My Schedule", () => {
  it("asks for days off in a dialog, sending the days and the reason", async () => {
    render(<MyLeave />);
    await screen.findByText(/No leave yet/);
    fireEvent.click(screen.getByRole("button", { name: /Request Leave/ }));
    const dialog = within(await screen.findByRole("dialog"));
    const send = dialog.getByRole("button", { name: /Request Leave/ });
    expect(send).toBeDisabled();

    fireEvent.change(dialog.getByLabelText("From *"), { target: { value: "2026-11-03" } });
    expect(dialog.getByLabelText("To *")).toHaveValue("2026-11-03"); // one day, unless changed
    fireEvent.change(dialog.getByLabelText("To *"), { target: { value: "2026-11-05" } });
    fireEvent.change(dialog.getByLabelText("Reason for leave"), { target: { value: "Vacation" } });
    fireEvent.click(send);

    await waitFor(() => expect(h.calls).toEqual([
      ["request", { startDate: "2026-11-03", endDate: "2026-11-05", reason: "Vacation", note: undefined }],
    ]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("lists every request with how it stands, the newest on top", async () => {
    h.leave = [
      leave({ id: "l2", startDate: "2026-12-01", endDate: "2026-12-01", status: "rejected", decidedBy: "Super Admin",
        decisionReason: "Clinic is short-staffed", createdAt: "2026-10-20T01:00:00Z" }),
      leave({ id: "l1", conflicts: [{ id: "a1", patientName: "Jose", date: "2026-11-04", time: "10:00", status: "confirmed" }] }),
      leave({ id: "l3", startDate: "2026-12-20", endDate: "2026-12-21", status: "approved", createdAt: "2026-10-26T05:00:00Z" }),
    ];
    render(<MyLeave daysOff={[{ id: "u1", date: "2026-12-30", reason: "Clinic closed", remarks: null }]} />);
    await screen.findByText("Nov 3 – Nov 5");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("td")!.textContent)).toEqual([
      "Dec 20 – Dec 212 days", "Nov 3 – Nov 53 days", "Dec 11 day", "Dec 30Whole day",
    ]);
    expect(within(rows[1]).getByText("pending")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/1 booking to move first/)).toBeInTheDocument();
    expect(within(rows[2]).getByText("Rejected by Super Admin: Clinic is short-staffed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel request for Nov 3 – Nov 5" }));
    await waitFor(() => expect(h.calls).toEqual([["cancel", "l1"]]));
  });

  it("asks for some hours of one day", async () => {
    render(<MyLeave />);
    await screen.findByText(/No leave yet/);
    fireEvent.click(screen.getByRole("button", { name: /Request Leave/ }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("From *"), { target: { value: "2026-11-03" } });
    fireEvent.click(dialog.getByRole("radio", { name: "Part of a day" }));
    expect(dialog.getByLabelText("To *")).toBeDisabled(); // one day only
    fireEvent.change(dialog.getByLabelText("Reason for leave"), { target: { value: "Personal" } });
    const send = dialog.getByRole("button", { name: /Request Leave/ });
    expect(send).toBeDisabled(); // no hours yet
    fireEvent.change(dialog.getByLabelText("Leave starts at"), { target: { value: "13:00" } });
    fireEvent.change(dialog.getByLabelText("Leave ends at"), { target: { value: "17:00" } });
    fireEvent.click(send);
    await waitFor(() => expect(h.calls).toEqual([
      ["request", { startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", reason: "Personal", note: undefined }],
    ]));
  });

  it("shows the hours of leave for part of a day, and when each was requested", async () => {
    h.leave = [leave({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", createdAt: "2026-10-26T01:14:00Z" })];
    render(<MyLeave />);
    expect(await screen.findByText("1:00 PM – 5:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Oct 26, 2026")).toBeInTheDocument();
    expect(screen.getByText("9:14 AM")).toBeInTheDocument();
  });

  it("also shows days off the clinic set, but not the days approved leave already covers", async () => {
    h.leave = [leave({ status: "approved", removedDates: ["2026-11-05"] })];
    render(<MyLeave daysOff={[
      { id: "u1", date: "2026-11-03", reason: "Vacation", remarks: null },
      { id: "u2", date: "2026-11-20", reason: "Clinic seminar", remarks: null },
    ]} />);
    await screen.findByText("Nov 3 – Nov 5");
    expect(screen.getByText("1 day removed")).toBeInTheDocument();
    expect(screen.getByText("Nov 20")).toBeInTheDocument();
    expect(screen.getByText("Set by the clinic")).toBeInTheDocument();
    expect(screen.getAllByText("Set by the clinic")).toHaveLength(1);
  });
});

describe("asking to change approved leave", () => {
  const change = (over = {}) => ({
    dates: ["2026-11-04"], startTime: null, endTime: null, note: null, status: "pending" as const,
    requestedAt: "2026-10-26T01:30:00Z", decidedBy: null, decidedAt: null, decisionReason: null, ...over,
  });

  it("ticks the days to work after all, and sends them for approval", async () => {
    h.leave = [leave({ status: "approved" })];
    render(<MyLeave />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask to change leave for Nov 3 – Nov 5" }));
    const dialog = within(await screen.findByRole("dialog"));
    const send = dialog.getByRole("button", { name: /Request Change/ });
    expect(send).toBeDisabled();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Wed, Nov 4, 2026" }));
    fireEvent.change(dialog.getByLabelText("Note (optional)"), { target: { value: "Back early" } });
    fireEvent.click(send);
    await waitFor(() => expect(h.calls).toEqual([["change", "l1", { dates: ["2026-11-04"] }, "Back early"]]));
  });

  it("asks for fewer hours of leave for part of a day", async () => {
    h.leave = [leave({ status: "approved", startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00" })];
    render(<MyLeave />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask to change leave for Nov 3" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("radio", { name: "Fewer hours" }));
    const send = dialog.getByRole("button", { name: /Request Change/ });
    expect(send).toBeDisabled(); // still the approved hours
    fireEvent.change(dialog.getByLabelText("Leave ends at"), { target: { value: "15:00" } });
    fireEvent.click(send);
    await waitFor(() => expect(h.calls).toEqual([["change", "l1", { startTime: "13:00", endTime: "15:00" }, undefined]]));
  });

  it("shows the change while it waits, and can withdraw it", async () => {
    h.leave = [leave({ status: "approved", changeRequest: change() })];
    render(<MyLeave />);
    expect(await screen.findByText("Asked to work Nov 4: waiting for approval")).toBeInTheDocument();
    expect(screen.getByText("Change pending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw change to Nov 3 – Nov 5" }));
    await waitFor(() => expect(h.calls).toEqual([["withdraw", "l1"]]));
  });

  it("says why a change was rejected", async () => {
    h.leave = [leave({ status: "approved", changeRequest: change({ status: "rejected", decidedBy: "Super Admin", decisionReason: "Short-staffed" }) })];
    render(<MyLeave />);
    expect(await screen.findByText("Change to work Nov 4 rejected by Super Admin: Short-staffed")).toBeInTheDocument();
  });

  it("shows the change asked for in the leave's details", async () => {
    h.leave = [leave({ status: "approved", decidedBy: "Super Admin", changeRequest: change({ note: "Back early" }) })];
    render(<MyLeave />);
    fireEvent.click(await screen.findByRole("button", { name: "View leave for Nov 3 – Nov 5" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Change asked")).toBeInTheDocument();
    expect(dialog.getByText("work Nov 4")).toBeInTheDocument();
    expect(dialog.getByText("Back early")).toBeInTheDocument();
    expect(dialog.getAllByText("On leave")).toHaveLength(3);
  });

  it("is decided by the superadmin", async () => {
    const l = leave({ status: "approved", changeRequest: change({ note: "Back early" }) });
    render(<DecideLeave l={l} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve change to Aerhol Gocalin's leave for Nov 3 – Nov 5" }));
    await waitFor(() => expect(h.calls).toEqual([["approveChange", "l1"]]));

    fireEvent.click(screen.getByRole("button", { name: "Reject change to Aerhol Gocalin's leave for Nov 3 – Nov 5" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Reason *"), { target: { value: "Short-staffed" } });
    fireEvent.click(dialog.getByRole("button", { name: "Reject Change" }));
    await waitFor(() => expect(h.calls).toContainEqual(["rejectChange", "l1", "Short-staffed"]));
  });
});

describe("the superadmin deciding on leave", () => {
  const named = "Aerhol Gocalin's leave for Nov 3 – Nov 5";

  it("won't approve while bookings are in the way", async () => {
    render(<DecideLeave l={leave({ conflicts: [{ id: "a1", patientName: "Jose", date: "2026-11-04", time: "10:00", status: "confirmed" }] })} />);
    expect(screen.getByRole("button", { name: `Approve ${named}` })).toBeDisabled();
  });

  it("approves", async () => {
    render(<DecideLeave l={leave({})} />);
    fireEvent.click(screen.getByRole("button", { name: `Approve ${named}` }));
    await waitFor(() => expect(h.calls).toEqual([["approve", "l1"]]));
  });

  it("rejects only with a reason", async () => {
    render(<DecideLeave l={leave({})} />);
    fireEvent.click(screen.getByRole("button", { name: `Reject ${named}` }));
    const dialog = within(await screen.findByRole("dialog"));
    const confirm = dialog.getByRole("button", { name: "Reject Leave" });
    expect(confirm).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("Reason *"), { target: { value: "Two dentists already off that week" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(h.calls).toEqual([["reject", "l1", "Two dentists already off that week"]]));
  });
});

describe("a person's leave on their staff schedule page", () => {
  const staffLeave = (daysOff: Parameters<typeof StaffLeave>[0]["daysOff"] = [], onRemoveDayOff = vi.fn()) =>
    render(<MemoryRouter><StaffLeave dentistId="dr-1" daysOff={daysOff} onRemoveDayOff={onRemoveDayOff} /></MemoryRouter>);

  it("is a record: it points to the Schedule page to decide", async () => {
    h.leave = [leave({})];
    staffLeave();
    expect(await screen.findByText(/1 waiting for approval/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "/superadmin/schedule");
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Day Off/ })).toBeNull();
    expect(screen.getByRole("button", { name: "View Aerhol Gocalin's leave for Nov 3 – Nov 5" })).toBeInTheDocument();
  });

  it("changes approved leave at once: days, or fewer hours of a part-day leave", async () => {
    h.leave = [
      leave({ status: "approved" }),
      leave({ id: "l2", status: "approved", startDate: "2026-11-20", endDate: "2026-11-20", startTime: "13:00", endTime: "17:00", createdAt: "2026-10-25T01:00:00Z" }),
    ];
    staffLeave();
    fireEvent.click(await screen.findByRole("button", { name: "Change Aerhol Gocalin's leave for Nov 3 – Nov 5" }));
    let dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("checkbox", { name: "Wed, Nov 4, 2026" }));
    fireEvent.click(dialog.getByRole("button", { name: "Remove 1 day" }));
    await waitFor(() => expect(h.calls).toEqual([["removeDays", "l1", ["2026-11-04"]]]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Change Aerhol Gocalin's leave for Nov 20" }));
    dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("radio", { name: "Fewer hours" }));
    fireEvent.change(dialog.getByLabelText("Leave ends at"), { target: { value: "15:00" } });
    fireEvent.click(dialog.getByRole("button", { name: /Save Change/ }));
    await waitFor(() => expect(h.calls).toContainEqual(["shorten", "l2", "13:00", "15:00"]));
  });

  it("lists days off the clinic set beside the requests, and deletes them", async () => {
    h.leave = [leave({ status: "approved" })];
    const remove = vi.fn();
    staffLeave([
      { id: "u1", date: "2026-11-04", reason: "Vacation", remarks: null }, // made by the leave: not listed twice
      { id: "u2", date: "2026-11-20", reason: "Clinic seminar", remarks: null },
    ], remove);
    await screen.findByText("Nov 3 – Nov 5");
    expect(screen.getAllByText("Set by the clinic")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete day off Nov 20" }));
    expect(remove).toHaveBeenCalledWith("u2");
  });
});

describe("the superadmin adding leave for someone", () => {
  const staff = [{ id: "dr-1", name: "Aerhol Gocalin", role: "dentist" }, { id: "ad-1", name: "Sarah Chen", role: "admin" }];
  const fill = () => {
    fireEvent.change(screen.getByLabelText("Who the leave is for"), { target: { value: "ad-1" } });
    fireEvent.change(screen.getByLabelText("From *"), { target: { value: "2026-11-03" } });
    fireEvent.change(screen.getByLabelText("Reason for leave"), { target: { value: "Sick leave" } });
  };

  it("has to say who it's for, then sends it for them", async () => {
    h.leave = [leave({ status: "approved", dentistName: "Sarah Chen" })];
    render(<FileLeave staff={staff} />);
    const add = screen.getByRole("button", { name: /Add Leave/ });
    fireEvent.change(screen.getByLabelText("From *"), { target: { value: "2026-11-03" } });
    fireEvent.change(screen.getByLabelText("Reason for leave"), { target: { value: "Sick leave" } });
    expect(add).toBeDisabled(); // nobody picked yet
    fill();
    fireEvent.click(add);
    await waitFor(() => expect(h.calls).toEqual([
      ["request", { startDate: "2026-11-03", endDate: "2026-11-03", reason: "Sick leave", note: undefined, staffId: "ad-1" }],
    ]));
    expect(toasts.success).toHaveBeenCalledWith("Leave added for Sarah Chen. Those days are now Unavailable Dates.");
  });

  it("says so when bookings keep it waiting", async () => {
    h.leave = [leave({ status: "pending", conflicts: [{ id: "a1", patientName: "Jose", date: "2026-11-03", time: "10:00", status: "confirmed" }] })];
    render(<FileLeave staff={staff} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Add Leave/ }));
    await waitFor(() => expect(toasts.warning).toHaveBeenCalledWith(
      "Saved, but 1 appointment(s) on those days must be moved before it's approved.",
    ));
  });
});
