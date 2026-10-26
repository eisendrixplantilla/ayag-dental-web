import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/staff.ts handler. The database is a small in-memory `users` table
// that understands the handful of queries the handler makes; the session is faked as
// the Super Admin, who is the only role allowed to manage staff.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({ users: [] as Row[], n: 0, session: null as Row | null, signedOut: false }));

/**
 * What the assign-codes statement does to users, in JS: every staff account whose
 * employee_id isn't its role's DT-/AN-/SA-YYMMNN is numbered, oldest first, after the
 * highest of its prefix and month (Manila time).
 */
function assignStaffCodes() {
  const prefixOf = (role: string) => (role === "dentist" ? "DT" : role === "admin" ? "AN" : "SA");
  const ym = (at: string) => {
    const d = new Date(new Date(at).getTime() + 8 * 3600_000).toISOString();
    return d.slice(2, 4) + d.slice(5, 7);
  };
  const staff = h.users.filter(u => ["dentist", "admin", "superadmin"].includes(u.role));
  const fits = (u: Row) => new RegExp(`^${prefixOf(u.role)}-[0-9]{6,}$`).test(u.employee_id ?? "");
  const top = new Map<string, number>();
  for (const u of staff.filter(fits)) {
    const key = u.employee_id.slice(0, 7);
    top.set(key, Math.max(top.get(key) ?? 0, Number(u.employee_id.slice(7))));
  }
  const given: Row[] = [];
  for (const u of staff.filter(u => !fits(u)).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    const key = `${prefixOf(u.role)}-${ym(u.created_at)}`;
    const n = (top.get(key) ?? 0) + 1;
    top.set(key, n);
    u.employee_id = `${key}${String(n).padStart(2, "0")}`;
    given.push({ id: u.id, code: u.employee_id });
  }
  return given;
}

vi.mock("../../api/_lib/db.js", () => ({
  sql: Object.assign(vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join("?");

    if (text.includes("FROM patients WHERE lower(email)")) return [];
    if (text.includes("FROM users WHERE lower(email)")) return h.users.filter(u => u.email === v[0]).map(u => ({ id: u.id }));
    if (text.includes("INSERT INTO users")) {
      const [email, password_hash, first_name, last_name, contact_number, role] = v;
      const row: Row = {
        id: `staff-${++h.n}`, employee_id: null, email, password_hash, first_name, middle_name: null, last_name,
        contact_number, role, verified: true, status: "active", photo_url: null,
        archived_at: null, archived_by: null, archived_reason: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      h.users.push(row);
      return [row];
    }
    if (text.includes("UPDATE users SET") && text.includes("status = 'archived'")) {
      const [archived_by, archived_reason, id] = v;
      const row = h.users.find(u => u.id === id)!;
      Object.assign(row, { status: "archived", archived_at: "2026-09-24T01:00:00Z", archived_by, archived_reason });
      return [];
    }
    if (text.includes("UPDATE users SET status = 'active'")) {
      const row = h.users.find(u => u.id === v[0])!;
      Object.assign(row, { status: "active", archived_at: null, archived_by: null, archived_reason: null });
      return [];
    }
    if (text.includes("SELECT * FROM users WHERE id")) return h.users.filter(u => u.id === v[0]).map(u => ({ ...u }));
    if (text.includes("SELECT * FROM users WHERE role IN")) {
      const archived = text.includes("= 'archived'");
      return h.users.filter(u => (u.status === "archived") === archived).map(u => ({ ...u }));
    }
    if (text.includes("letterhead-info")) {
      return [{ name: "Ayag Dental Clinic", phone: "0917 123 4567", email: "info@ayagdental.com", address: "Cabanatuan City" }];
    }
    if (text.includes("letterhead-hours")) {
      return [{ day: "Monday", open_time: "09:00", close_time: "17:00", enabled: true }];
    }
    if (text.includes("unavailable-times")) return [];
    if (text.includes("schedules-all-days")) {
      return [
        { dentist_id: "dr-1", day_of_week: 1, start_time: "09:00", end_time: "17:00", lunch_start: null, lunch_end: null, duration_minutes: 30, max_patient: 20 },
        { dentist_id: "ad-1", day_of_week: 0, start_time: "08:00", end_time: "12:00", lunch_start: null, lunch_end: null, duration_minutes: 30, max_patient: 20 },
        { dentist_id: "dr-1", day_of_week: 2, start_time: "10:00", end_time: "16:00", lunch_start: null, lunch_end: null, duration_minutes: 30, max_patient: 20 },
      ];
    }
    if (text.includes("schedules-all-unavailable")) {
      return [{ id: "u1", dentist_id: "dr-2", unavailable_date: "2026-11-04T00:00:00Z", reason: "Vacation", remarks: null }];
    }
    throw new Error(`unexpected query: ${text}`);
  }), {
    query: vi.fn(async (text: string) => {
      if (text.includes("assign-codes:users")) return assignStaffCodes();
      throw new Error(`unexpected query: ${text}`);
    }),
  }),
}));
vi.mock("../../api/_lib/auth.js", () => ({
  getSessionFromRequest: () => h.signedOut ? null : h.session ?? { sub: "su-1", email: "super@admin.com", role: "superadmin" },
}));

type Res = { code?: number; body?: any };
// A fresh copy of the handler for each test: older accounts' IDs are converted once per
// server instance, and each test starts a new one.
async function call(method: string, opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<Res> {
  const { default: handler } = await import("../../api/staff");
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  await (handler as any)({ method, query: opts.query ?? {}, body: opts.body, headers: {} }, res);
  return res;
}

const newStaff = (over: Record<string, unknown> = {}) => ({
  name: "Dr. Mike Johnson", email: "mike@ayagdental.com", contact: "09171234567",
  role: "dentist", password: "dentist123", ...over,
});
const existing = (employee_id: string | null, over: Row = {}): Row => ({
  id: `old-${employee_id ?? "none"}`, employee_id, email: `${employee_id ?? "none"}@ayagdental.com`,
  first_name: "Sarah", middle_name: null, last_name: "Chen", contact_number: null, role: "admin",
  status: "active", photo_url: null, archived_at: null, archived_by: null, archived_reason: null,
  created_at: "2026-01-01T00:00:00Z", ...over,
});

beforeEach(() => {
  vi.resetModules();
  h.users = [];
  h.n = 0;
});

describe("every staff account gets an ID from the month it was made", () => {
  // 9 November 2025, mid-morning in Manila.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-11-09T02:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("gives a dentist DT-YYMM01, and an admin AN-YYMM01, each counted on its own", async () => {
    const dentist = await call("POST", { body: newStaff() });
    const admin = await call("POST", { body: newStaff({ email: "ana@ayagdental.com", role: "admin" }) });

    expect(dentist.code).toBe(201);
    expect(dentist.body.staff.employeeId).toBe("DT-251101");
    expect(admin.body.staff.employeeId).toBe("AN-251101");
  });

  it("counts on through the month: 01, 02, 03", async () => {
    const ids = [];
    for (const email of ["a@x.com", "b@x.com", "c@x.com"]) ids.push((await call("POST", { body: newStaff({ email }) })).body.staff.employeeId);
    expect(ids).toEqual(["DT-251101", "DT-251102", "DT-251103"]);
  });

  it("uses the Manila month, not the server's", async () => {
    // 4 PM UTC on Oct 31 is already November 1 in Manila.
    vi.setSystemTime(new Date("2025-10-31T16:30:00Z"));
    expect((await call("POST", { body: newStaff() })).body.staff.employeeId).toBe("DT-251101");
  });

  it("ignores an ID typed in", async () => {
    const res = await call("POST", { body: newStaff({ employeeId: "EMP-100" }) });
    expect(res.body.staff.employeeId).toBe("DT-251101");
  });

  it("gives older accounts theirs from the month each was made, oldest first, and only once", async () => {
    h.users = [
      existing("EMP-001", { id: "a", role: "dentist", created_at: "2026-01-05T03:00:00Z" }),
      existing(null, { id: "b", role: "dentist", created_at: "2026-01-20T05:00:00Z" }),
      existing("EMP-03172026", { id: "c", role: "admin", created_at: "2026-03-17T01:00:00Z" }),
      existing("DT-260107", { id: "d", role: "dentist", created_at: "2026-01-02T00:00:00Z" }),
      existing(null, { id: "e", role: "superadmin", created_at: "2026-02-01T00:00:00Z" }),
    ];

    const res = await call("GET");
    expect(res.code).toBe(200);
    expect(Object.fromEntries(h.users.map(u => [u.id, u.employee_id]))).toEqual({
      a: "DT-260108", b: "DT-260109", // after January's highest so far
      c: "AN-260301", d: "DT-260107", // already in the format: left as it is
      e: "SA-260201",
    });

    // And the new account made today follows on from them.
    expect((await call("POST", { body: newStaff() })).body.staff.employeeId).toBe("DT-251101");
  });
});

describe("archiving a staff account records why", () => {
  beforeEach(() => { h.users = [existing("EMP-001", { id: "dentist-1", role: "dentist" })]; });

  it("refuses to archive without a reason", async () => {
    const res = await call("PATCH", { query: { id: "dentist-1" }, body: { action: "archive", reason: "  " } });

    expect(res.code).toBe(400);
    expect(h.users[0].status).toBe("active");
  });

  it("stores the reason, who did it and when", async () => {
    const res = await call("PATCH", {
      query: { id: "dentist-1" },
      body: { action: "archive", reason: "Resigned effective September 30, 2026.", archivedBy: "Super Administrator" },
    });

    expect(res.code).toBe(200);
    expect(res.body.staff).toMatchObject({
      status: "archived",
      archivedBy: "Super Administrator",
      archivedReason: "Resigned effective September 30, 2026.",
      archivedAt: "2026-09-24",
    });
  });

  it("clears all three again on restore", async () => {
    await call("PATCH", { query: { id: "dentist-1" }, body: { action: "archive", reason: "Leave of absence" } });
    const res = await call("PATCH", { query: { id: "dentist-1" }, body: { action: "restore" } });

    expect(res.body.staff).toMatchObject({
      status: "active", archivedBy: null, archivedReason: null, archivedAt: null,
    });
  });
});

describe("the clinic details printed on every document", () => {
  it("can be read by anyone signed in, a patient included", async () => {
    h.session = { sub: "p-1", email: "user@user.com", role: "patient" };
    try {
      const res = await call("GET", { query: { letterhead: "true" } });
      expect(res.code).toBe(200);
      expect(res.body.info).toEqual({ name: "Ayag Dental Clinic", phone: "0917 123 4567", email: "info@ayagdental.com", address: "Cabanatuan City" });
      expect(res.body.hours).toEqual([{ day: "Monday", open: "09:00", close: "17:00", enabled: true }]);
    } finally {
      h.session = null;
    }
  });

  it("is public, so the landing page can show it to visitors", async () => {
    h.signedOut = true;
    try {
      const res = await call("GET", { query: { letterhead: "true" } });
      expect(res.code).toBe(200);
      expect(res.body.info.phone).toBe("0917 123 4567");
    } finally {
      h.signedOut = false;
    }
  });
});

describe("everyone's schedule at once, for the Schedule page", () => {
  it("groups the days and days off by person", async () => {
    const res = await call("GET", { query: { schedule: "true", all: "true" } });
    expect(res.code).toBe(200);
    expect(Object.keys(res.body.schedules).sort()).toEqual(["ad-1", "dr-1", "dr-2"]);
    expect(res.body.schedules["dr-1"].days.map((d: any) => [d.dayOfWeek, d.start, d.end])).toEqual([[1, "09:00", "17:00"], [2, "10:00", "16:00"]]);
    expect(res.body.schedules["dr-1"].unavailable).toEqual([]);
    expect(res.body.schedules["dr-2"]).toMatchObject({ days: [], unavailable: [{ id: "u1", date: "2026-11-04", reason: "Vacation" }] });
  });

  it("is for the Super Admin only", async () => {
    h.session = { sub: "dr-1", email: "d@x.com", role: "dentist" };
    try {
      expect((await call("GET", { query: { schedule: "true", all: "true" } })).code).toBe(401);
    } finally {
      h.session = null;
    }
  });
});
