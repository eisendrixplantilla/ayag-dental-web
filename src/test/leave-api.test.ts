import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real leave handler in api/staff.ts (?leave=true) over a small in-memory
// database: users, leave_requests, appointments and dentist_unavailable.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  users: [] as Row[],
  leave: [] as Row[],
  appointments: [] as Row[],
  unavailable: [] as Row[],
  session: null as Row | null,
  n: 0,
}));

/** A leave row joined with its dentist's name, as the handler selects it. */
const withName = (l: Row) => {
  const u = h.users.find((x) => x.id === l.dentist_id)!;
  return { ...l, first_name: u.first_name, middle_name: null, last_name: u.last_name, role: u.role };
};

vi.mock("../../api/_lib/db.js", () => {
  const sql: any = vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join("?");
    if (text.includes("leave-requests-table") || text.includes("leave-columns") || text.includes("unavailable-times")) return [];
    if (text.includes("leave-free-day")) {
      const [dentist_id, date, reason, remarks] = v;
      h.unavailable = h.unavailable.filter((u) => !(u.dentist_id === dentist_id && u.unavailable_date === date
        && u.reason === reason && (u.remarks ?? null) === (remarks ?? null)));
      return [];
    }
    if (text.includes("leave-remove-days")) {
      const [removed_dates, status, changed_by, , id] = v;
      const row = h.leave.find((l) => l.id === id)!;
      Object.assign(row, { removed_dates, status }, changed_by ? { changed_by, changed_at: "2026-10-26T03:00:00Z" } : {});
      return [];
    }
    if (text.includes("leave-change")) {
      const [change, id] = v;
      h.leave.find((l) => l.id === id)!.change_request = change ? JSON.parse(change) : null;
      return [];
    }
    if (text.includes("leave-unavailable-hours")) {
      const [start_time, end_time, dentist_id, date, reason, remarks, old_start] = v;
      for (const u of h.unavailable) {
        if (u.dentist_id === dentist_id && u.unavailable_date === date && u.reason === reason
          && (u.remarks ?? null) === (remarks ?? null) && u.start_time === old_start) Object.assign(u, { start_time, end_time });
      }
      return [];
    }
    if (text.includes("leave-hours")) {
      const [start_time, end_time, changed_by, , id] = v;
      Object.assign(h.leave.find((l) => l.id === id)!, { start_time, end_time },
        changed_by ? { changed_by, changed_at: "2026-10-26T03:00:00Z" } : {});
      return [];
    }
    if (text.includes("leave-conflicts")) {
      const [dentistId, dentistName, from, to, statuses] = v;
      return h.appointments.filter((a) => (a.dentist_id === dentistId || a.dentist_name === dentistName)
        && a.date >= from && a.date <= to && statuses.includes(a.status));
    }
    if (text.includes("leave-overlap")) {
      const [dentistId, end, start] = v;
      return h.leave.filter((l) => l.dentist_id === dentistId && ["pending", "approved"].includes(l.status)
        && l.start_date <= end && l.end_date >= start);
    }
    if (text.includes("leave-insert")) {
      const [dentist_id, start_date, end_date, reason, note, start_time, end_time] = v;
      const row = { id: `leave-${++h.n}`, dentist_id, start_date, end_date, reason, note, start_time, end_time, status: "pending",
        decided_by: null, decided_at: null, decision_reason: null,
        created_at: "2026-10-26T01:00:00Z", updated_at: "2026-10-26T01:00:00Z" };
      h.leave.push(row);
      return [{ id: row.id }];
    }
    if (text.includes("leave-cancel")) {
      Object.assign(h.leave.find((l) => l.id === v[0])!, { status: "cancelled" });
      return [];
    }
    if (text.includes("leave-decide")) {
      const approving = text.includes("'approved'");
      const row = approving ? h.leave.find((l) => l.id === v[1])! : h.leave.find((l) => l.id === v[2])!;
      Object.assign(row, approving
        ? { status: "approved", decided_by: v[0] }
        : { status: "rejected", decided_by: v[0], decision_reason: v[1] });
      return [];
    }
    if (text.includes("leave-unavailable")) {
      const [dentist_id, unavailable_date, reason, remarks, start_time, end_time] = v;
      if (!h.unavailable.some((u) => u.dentist_id === dentist_id && u.unavailable_date === unavailable_date)) {
        h.unavailable.push({ dentist_id, unavailable_date, reason, remarks, ...(start_time ? { start_time, end_time } : {}) });
      }
      return [];
    }
    if (text.includes("leave-staff")) return h.users.filter((u) => u.id === v[0] && ["dentist", "admin"].includes(u.role));
    if (text.includes("FROM users WHERE id")) return h.users.filter((u) => u.id === v[0]);
    throw new Error(`unexpected query: ${text}`);
  });
  sql.query = vi.fn(async (text: string, params: any[] = []) => {
    if (!text.includes("FROM leave_requests l")) throw new Error(`unexpected query: ${text}`);
    let rows = h.leave;
    if (text.includes("WHERE l.id = $1")) rows = rows.filter((l) => l.id === params[0]);
    else if (text.includes("l.dentist_id = $1 OR")) {
      rows = rows.filter((l) => l.dentist_id === params[0] || (l.status === "approved" && l.end_date >= params[1]));
    } else if (text.includes("WHERE l.dentist_id = $1")) rows = rows.filter((l) => l.dentist_id === params[0]);
    return rows.map(withName);
  });
  return { sql };
});
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => h.session }));

import handler from "../../api/staff";

const DENTIST = { sub: "dr-1", email: "dentist@ayagdental.com", role: "dentist" };
const SUPER = { sub: "super-1", email: "super@admin.com", role: "superadmin" };

type Res = { code?: number; body?: any };
function call(method: string, opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<Res> {
  const out: Res = {};
  const res: any = {
    status(code: number) { out.code = code; return res; },
    json(body: unknown) { out.body = body; return res; },
  };
  return Promise.resolve(handler({ method, query: { leave: "true", ...opts.query }, body: opts.body } as any, res)).then(() => out);
}
const ask = (body: Record<string, unknown>) => call("POST", { body });
const decide = (id: string, body: Record<string, unknown>) => call("PATCH", { query: { id }, body });

beforeEach(() => {
  // Monday, Oct 26 2026 in Manila.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T02:00:00Z"));
  h.users = [
    { id: "dr-1", first_name: "Aerhol", last_name: "Gocalin", role: "dentist" },
    { id: "super-1", first_name: "Super", last_name: "Admin", role: "superadmin" },
  ];
  h.leave = [];
  h.appointments = [];
  h.unavailable = [];
  h.session = DENTIST;
  h.n = 0;
});
afterEach(() => vi.useRealTimers());

describe("a dentist asking for leave", () => {
  it("sends a request that waits for the superadmin", async () => {
    const res = await ask({ startDate: "2026-11-03", endDate: "2026-11-05", reason: "Vacation", note: "Family trip" });
    expect(res.code).toBe(201);
    expect(res.body.leave).toMatchObject({
      dentistName: "Aerhol Gocalin", startDate: "2026-11-03", endDate: "2026-11-05", reason: "Vacation", status: "pending", conflicts: [],
    });
  });

  it("needs dates and a reason, in order, and not in the past", async () => {
    expect((await ask({ startDate: "2026-11-03", endDate: "2026-11-05", reason: " " })).code).toBe(400);
    expect((await ask({ startDate: "2026-11-05", endDate: "2026-11-03", reason: "Vacation" })).code).toBe(400);
    expect((await ask({ startDate: "2026-10-20", endDate: "2026-10-21", reason: "Vacation" })).code).toBe(400);
  });

  it("can't ask twice for the same days", async () => {
    await ask({ startDate: "2026-11-03", endDate: "2026-11-05", reason: "Vacation" });
    const again = await ask({ startDate: "2026-11-05", endDate: "2026-11-06", reason: "Seminar / Training" });
    expect(again.code).toBe(409);
  });

  it("is told which bookings stand in the way", async () => {
    h.appointments = [
      { id: "a1", dentist_id: "dr-1", dentist_name: "Aerhol Gocalin", patient_name: "Jose", date: "2026-11-04", time: "10:00", status: "confirmed" },
      { id: "a2", dentist_id: "dr-1", dentist_name: "Aerhol Gocalin", patient_name: "Ana", date: "2026-11-04", time: "11:00", status: "cancelled" },
      { id: "a3", dentist_id: "dr-1", dentist_name: "Aerhol Gocalin", patient_name: "Maria", date: "2026-11-09", time: "09:00", status: "confirmed" },
    ];
    const res = await ask({ startDate: "2026-11-03", endDate: "2026-11-05", reason: "Vacation" });
    expect(res.body.leave.conflicts.map((c: Row) => c.patientName)).toEqual(["Jose"]);
  });

  it("can take back a request that hasn't been decided", async () => {
    const { body } = await ask({ startDate: "2026-11-03", endDate: "2026-11-03", reason: "Personal" });
    const res = await decide(body.leave.id, { action: "cancel" });
    expect(res.body.leave.status).toBe("cancelled");
  });

  it("can be sent by an admin too", async () => {
    h.users.push({ id: "admin-1", first_name: "Sarah", last_name: "Chen", role: "admin" });
    h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
    const res = await ask({ startDate: "2026-11-03", endDate: "2026-11-03", reason: "Personal" });
    expect(res.code).toBe(201);
    expect(res.body.leave).toMatchObject({ dentistName: "Sarah Chen", role: "admin", status: "pending" });
  });

  it("can't be sent by a patient", async () => {
    h.session = { sub: "p1", email: "user@user.com", role: "patient" };
    expect((await ask({ startDate: "2026-11-03", endDate: "2026-11-03", reason: "Personal" })).code).toBe(403);
  });

  it("can't decide on it", async () => {
    const { body } = await ask({ startDate: "2026-11-03", endDate: "2026-11-03", reason: "Personal" });
    expect((await decide(body.leave.id, { action: "approve" })).code).toBe(403);
  });
});

describe("the superadmin deciding", () => {
  const requested = async (over: Record<string, unknown> = {}) => {
    h.session = DENTIST;
    const { body } = await ask({ startDate: "2026-11-03", endDate: "2026-11-05", reason: "Vacation", ...over });
    h.session = SUPER;
    return body.leave.id as string;
  };

  it("approves, turning every day into an Unavailable Date", async () => {
    const id = await requested({ note: "Family trip" });
    const res = await decide(id, { action: "approve" });
    expect(res.body.leave).toMatchObject({ status: "approved", decidedBy: "Super Admin" });
    expect(h.unavailable.map((u) => [u.unavailable_date, u.reason, u.remarks])).toEqual([
      ["2026-11-03", "Vacation", "Family trip"], ["2026-11-04", "Vacation", "Family trip"], ["2026-11-05", "Vacation", "Family trip"],
    ]);
  });

  it("keeps a day already marked unavailable as it was", async () => {
    h.unavailable = [{ dentist_id: "dr-1", unavailable_date: "2026-11-04", reason: "Seminar", remarks: null }];
    await decide(await requested(), { action: "approve" });
    expect(h.unavailable.filter((u) => u.unavailable_date === "2026-11-04")).toEqual([
      { dentist_id: "dr-1", unavailable_date: "2026-11-04", reason: "Seminar", remarks: null },
    ]);
  });

  it("can't approve while a booking still holds one of the days", async () => {
    const id = await requested();
    h.appointments = [{ id: "a1", dentist_id: "dr-1", dentist_name: "Aerhol Gocalin", patient_name: "Jose", date: "2026-11-04", time: "10:00", status: "pending" }];
    const res = await decide(id, { action: "approve" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/1 appointment on these days must be rescheduled or cancelled first/);
    expect(h.unavailable).toEqual([]);

    // Once it's moved, it goes through.
    h.appointments[0].date = "2026-11-10";
    expect((await decide(id, { action: "approve" })).code).toBe(200);
  });

  it("rejects only with a reason", async () => {
    const id = await requested();
    expect((await decide(id, { action: "reject", reason: "" })).code).toBe(400);
    const res = await decide(id, { action: "reject", reason: "Two dentists already off that week" });
    expect(res.body.leave).toMatchObject({ status: "rejected", decisionReason: "Two dentists already off that week" });
    expect(h.unavailable).toEqual([]);
  });

  it("decides each request once", async () => {
    const id = await requested();
    await decide(id, { action: "approve" });
    expect((await decide(id, { action: "reject", reason: "Changed my mind" })).code).toBe(409);
  });
});

describe("who sees which requests", () => {
  beforeEach(() => {
    h.users.push({ id: "dr-2", first_name: "Mike", last_name: "Johnson", role: "dentist" });
    h.leave = [
      { id: "l1", dentist_id: "dr-1", start_date: "2026-11-03", end_date: "2026-11-05", reason: "Vacation", status: "approved", created_at: "x", updated_at: "x" },
      { id: "l2", dentist_id: "dr-2", start_date: "2026-11-10", end_date: "2026-11-10", reason: "Sick leave", status: "pending", created_at: "x", updated_at: "x" },
      { id: "l3", dentist_id: "dr-2", start_date: "2026-10-01", end_date: "2026-10-02", reason: "Personal", status: "approved", created_at: "x", updated_at: "x" },
    ];
  });
  const ids = async () => (await call("GET")).body.leave.map((l: Row) => l.id);

  it("a dentist: only their own", async () => {
    h.session = DENTIST;
    expect(await ids()).toEqual(["l1"]);
  });
  it("the superadmin: everyone's", async () => {
    h.session = SUPER;
    expect(await ids()).toEqual(["l1", "l2", "l3"]);
  });
  it("the front desk: its own, and everyone's approved leave still to come", async () => {
    h.users.push({ id: "admin-1", first_name: "Sarah", last_name: "Chen", role: "admin" });
    h.leave.push({ id: "l4", dentist_id: "admin-1", start_date: "2026-12-01", end_date: "2026-12-01", reason: "Personal", status: "rejected", created_at: "x", updated_at: "x" });
    h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
    expect(await ids()).toEqual(["l1", "l4"]);
  });
  it("a patient: none", async () => {
    h.session = { sub: "p1", email: "user@user.com", role: "patient" };
    expect((await call("GET")).code).toBe(403);
  });
});

describe("the superadmin filing leave for someone", () => {
  beforeEach(() => { h.session = SUPER; });

  it("is approved at once, the days becoming Unavailable Dates", async () => {
    const res = await ask({ staffId: "dr-1", startDate: "2026-11-03", endDate: "2026-11-04", reason: "Sick leave" });
    expect(res.code).toBe(201);
    expect(res.body.leave).toMatchObject({ dentistName: "Aerhol Gocalin", status: "approved", decidedBy: "Super Admin" });
    expect(h.unavailable.map((u) => u.unavailable_date)).toEqual(["2026-11-03", "2026-11-04"]);
  });

  it("waits, like any request, while bookings still hold those days", async () => {
    h.appointments = [{ id: "a1", dentist_id: "dr-1", dentist_name: "Aerhol Gocalin", patient_name: "Jose", date: "2026-11-04", time: "10:00", status: "confirmed" }];
    const res = await ask({ staffId: "dr-1", startDate: "2026-11-03", endDate: "2026-11-04", reason: "Sick leave" });
    expect(res.body.leave).toMatchObject({ status: "pending" });
    expect(res.body.leave.conflicts.map((c: Row) => c.patientName)).toEqual(["Jose"]);
    expect(h.unavailable).toEqual([]);
  });

  it("has to say who it's for: a dentist or an admin", async () => {
    expect((await ask({ startDate: "2026-11-03", endDate: "2026-11-03", reason: "Personal" })).code).toBe(400);
    expect((await ask({ staffId: "super-1", startDate: "2026-11-03", endDate: "2026-11-03", reason: "Personal" })).code).toBe(400);
  });
});

describe("the superadmin taking days off approved leave", () => {
  const approved = async () => {
    h.session = SUPER;
    h.unavailable = [{ dentist_id: "dr-1", unavailable_date: "2026-11-06", reason: "Seminar", remarks: null }];
    const { body } = await ask({ staffId: "dr-1", startDate: "2026-11-03", endDate: "2026-11-06", reason: "Vacation" });
    return body.leave.id as string;
  };

  it("frees the days picked, keeping the rest of the leave", async () => {
    const id = await approved();
    const res = await decide(id, { action: "remove_days", dates: ["2026-11-04", "2026-11-05"] });
    expect(res.code).toBe(200);
    expect(res.body.leave).toMatchObject({ status: "approved", removedDates: ["2026-11-04", "2026-11-05"], changedBy: "Super Admin" });
    // Only the leave's own days go; a day off marked for something else stays.
    expect(h.unavailable.map((u) => u.unavailable_date).sort()).toEqual(["2026-11-03", "2026-11-06"]);
  });

  it("cancels the leave once no day is left", async () => {
    const id = await approved();
    await decide(id, { action: "remove_days", dates: ["2026-11-03", "2026-11-04"] });
    const res = await decide(id, { action: "remove_days", dates: ["2026-11-05", "2026-11-06"] });
    expect(res.body.leave).toMatchObject({ status: "cancelled", removedDates: ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"] });
  });

  it("only takes days the leave still covers, and none already past", async () => {
    const id = await approved();
    expect((await decide(id, { action: "remove_days", dates: [] })).code).toBe(400);
    expect((await decide(id, { action: "remove_days", dates: ["2026-11-09"] })).code).toBe(400);
    await decide(id, { action: "remove_days", dates: ["2026-11-04"] });
    expect((await decide(id, { action: "remove_days", dates: ["2026-11-04"] })).code).toBe(400);

    h.leave.push({ id: "old", dentist_id: "dr-1", start_date: "2026-10-20", end_date: "2026-10-28", reason: "Vacation", status: "approved", created_at: "x", updated_at: "x" });
    const past = await decide("old", { action: "remove_days", dates: ["2026-10-25"] });
    expect(past.code).toBe(400);
    expect(past.body.error).toMatch(/already past/);
    expect((await decide("old", { action: "remove_days", dates: ["2026-10-27"] })).code).toBe(200);
  });

  it("is for the superadmin, on approved leave only", async () => {
    const id = await approved();
    h.session = DENTIST;
    expect((await decide(id, { action: "remove_days", dates: ["2026-11-04"] })).code).toBe(403);

    const { body } = await ask({ startDate: "2026-11-20", endDate: "2026-11-20", reason: "Personal" });
    h.session = SUPER;
    expect((await decide(body.leave.id, { action: "remove_days", dates: ["2026-11-20"] })).code).toBe(409);
  });

  it("lets new leave be asked for on the days freed", async () => {
    const id = await approved();
    await decide(id, { action: "remove_days", dates: ["2026-11-05", "2026-11-06"] });
    h.session = DENTIST;
    expect((await ask({ startDate: "2026-11-05", endDate: "2026-11-06", reason: "Personal" })).code).toBe(201);
    expect((await ask({ startDate: "2026-11-04", endDate: "2026-11-04", reason: "Personal" })).code).toBe(409);
  });
});

describe("leave for part of a day", () => {
  it("is asked for with its hours, on one day", async () => {
    const res = await ask({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", reason: "Personal" });
    expect(res.code).toBe(201);
    expect(res.body.leave).toMatchObject({ startDate: "2026-11-03", startTime: "13:00", endTime: "17:00", status: "pending" });
  });

  it("needs both hours, the end after the start, and one day only", async () => {
    expect((await ask({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", reason: "Personal" })).code).toBe(400);
    expect((await ask({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "17:00", endTime: "13:00", reason: "Personal" })).code).toBe(400);
    expect((await ask({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "1pm", endTime: "5pm", reason: "Personal" })).code).toBe(400);
    const twoDays = await ask({ startDate: "2026-11-03", endDate: "2026-11-04", startTime: "13:00", endTime: "17:00", reason: "Personal" });
    expect(twoDays.code).toBe(400);
    expect(twoDays.body.error).toMatch(/one day only/);
  });

  it("is held up only by bookings in those hours", async () => {
    h.appointments = [
      { id: "a1", dentist_id: "dr-1", dentist_name: "Aerhol Gocalin", patient_name: "Jose", date: "2026-11-03", time: "09:00", end_time: "10:00", status: "confirmed" },
      { id: "a2", dentist_id: "dr-1", dentist_name: "Aerhol Gocalin", patient_name: "Ana", date: "2026-11-03", time: "12:45", status: "confirmed" },
    ];
    const res = await ask({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", reason: "Personal" });
    // Ana's has no end time: 30 minutes, so it runs into 1:00 PM.
    expect(res.body.leave.conflicts.map((c: Row) => c.patientName)).toEqual(["Ana"]);
  });

  it("once approved, closes only those hours of the day", async () => {
    h.session = SUPER;
    const res = await ask({ staffId: "dr-1", startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", reason: "Personal" });
    expect(res.body.leave.status).toBe("approved");
    expect(h.unavailable).toEqual([
      { dentist_id: "dr-1", unavailable_date: "2026-11-03", reason: "Personal", remarks: null, start_time: "13:00", end_time: "17:00" },
    ]);
  });
});

describe("the dentist asking to change approved leave", () => {
  const approved = async (body: Record<string, unknown> = { startDate: "2026-11-03", endDate: "2026-11-06", reason: "Vacation" }) => {
    h.session = SUPER;
    const res = await ask({ staffId: "dr-1", ...body });
    h.session = DENTIST;
    return res.body.leave.id as string;
  };
  const days = () => h.unavailable.map((u) => u.unavailable_date).sort();

  it("asks to work some days after all; nothing changes until the superadmin approves", async () => {
    const id = await approved();
    const res = await decide(id, { action: "request_change", dates: ["2026-11-05", "2026-11-04"], note: "Trip cut short" });
    expect(res.code).toBe(200);
    expect(res.body.leave.changeRequest).toMatchObject({ dates: ["2026-11-04", "2026-11-05"], note: "Trip cut short", status: "pending" });
    expect(days()).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);

    h.session = SUPER;
    const ok = await decide(id, { action: "approve_change" });
    expect(ok.body.leave).toMatchObject({
      status: "approved", removedDates: ["2026-11-04", "2026-11-05"],
      changeRequest: { status: "approved", decidedBy: "Super Admin" },
      changedBy: null, // their own ask, not the superadmin cutting it short
    });
    expect(days()).toEqual(["2026-11-03", "2026-11-06"]);
  });

  it("is rejected only with a reason, leaving the leave as it was", async () => {
    const id = await approved();
    await decide(id, { action: "request_change", dates: ["2026-11-04"] });
    h.session = SUPER;
    expect((await decide(id, { action: "reject_change", reason: " " })).code).toBe(400);
    const res = await decide(id, { action: "reject_change", reason: "Short-staffed that day" });
    expect(res.body.leave).toMatchObject({ removedDates: [], changeRequest: { status: "rejected", decisionReason: "Short-staffed that day" } });
    expect(days()).toHaveLength(4);
  });

  it("asks for fewer hours of leave for part of a day", async () => {
    const id = await approved({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", reason: "Personal" });
    expect((await decide(id, { action: "request_change", startTime: "12:00", endTime: "15:00" })).code).toBe(400); // outside
    expect((await decide(id, { action: "request_change", startTime: "13:00", endTime: "17:00" })).code).toBe(400); // the same
    expect((await decide(id, { action: "request_change", startTime: "15:00", endTime: "14:00" })).code).toBe(400);
    expect((await decide(id, { action: "request_change", startTime: "13:00", endTime: "15:00" })).code).toBe(200);
    h.session = SUPER;
    const res = await decide(id, { action: "approve_change" });
    expect(res.body.leave).toMatchObject({ startTime: "13:00", endTime: "15:00", status: "approved" });
    expect(h.unavailable).toEqual([
      { dentist_id: "dr-1", unavailable_date: "2026-11-03", reason: "Personal", remarks: null, start_time: "13:00", end_time: "15:00" },
    ]);
  });

  it("can drop leave for part of a day altogether", async () => {
    const id = await approved({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", reason: "Personal" });
    await decide(id, { action: "request_change", dates: ["2026-11-03"] });
    h.session = SUPER;
    expect((await decide(id, { action: "approve_change" })).body.leave.status).toBe("cancelled");
    expect(h.unavailable).toEqual([]);
  });

  it("is one at a time, on their own approved leave, and can be withdrawn while it waits", async () => {
    const id = await approved();
    expect((await decide(id, { action: "request_change", dates: [] })).code).toBe(400);
    expect((await decide(id, { action: "request_change", startTime: "13:00", endTime: "15:00" })).code).toBe(400); // whole days
    await decide(id, { action: "request_change", dates: ["2026-11-04"] });
    expect((await decide(id, { action: "request_change", dates: ["2026-11-05"] })).code).toBe(409);
    expect((await decide(id, { action: "approve_change" })).code).toBe(403); // not theirs to decide

    const cancelled = await decide(id, { action: "cancel_change" });
    expect(cancelled.body.leave.changeRequest).toBeNull();
    h.session = SUPER;
    expect((await decide(id, { action: "approve_change" })).code).toBe(409);
    expect((await decide(id, { action: "request_change", dates: ["2026-11-04"] })).code).toBe(403);

    h.session = DENTIST;
    const { body } = await ask({ startDate: "2026-11-20", endDate: "2026-11-20", reason: "Personal" });
    expect((await decide(body.leave.id, { action: "request_change", dates: ["2026-11-20"] })).code).toBe(409); // still pending
  });
});

describe("the superadmin cutting part-day leave to fewer hours", () => {
  const approved = async () => {
    h.session = SUPER;
    const res = await ask({ staffId: "dr-1", startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "17:00", reason: "Personal" });
    return res.body.leave.id as string;
  };

  it("does it at once, and records who did", async () => {
    const id = await approved();
    const res = await decide(id, { action: "shorten", startTime: "13:00", endTime: "15:00" });
    expect(res.body.leave).toMatchObject({ startTime: "13:00", endTime: "15:00", changedBy: "Super Admin" });
    expect(h.unavailable[0]).toMatchObject({ start_time: "13:00", end_time: "15:00" });
  });

  it("only inside the approved hours, and only by the superadmin", async () => {
    const id = await approved();
    expect((await decide(id, { action: "shorten", startTime: "12:00", endTime: "15:00" })).code).toBe(400);
    h.session = DENTIST;
    expect((await decide(id, { action: "shorten", startTime: "13:00", endTime: "15:00" })).code).toBe(403);
  });
});
