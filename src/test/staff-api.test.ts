import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/staff.ts handler. The database is a small in-memory `users` table
// that understands the handful of queries the handler makes; the session is faked as
// the Super Admin, who is the only role allowed to manage staff.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({ users: [] as Row[], n: 0 }));

const empNumber = (id: unknown) =>
  typeof id === "string" && /^EMP-[0-9]+$/.test(id) ? Number(id.slice(4)) : null;

vi.mock("../../api/_lib/db.js", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join("?");

    // The next-free-number lookup behind an auto-assigned Employee ID.
    if (text.includes("MAX(substring(employee_id from 5)")) {
      const used = h.users.map(u => empNumber(u.employee_id)).filter((n): n is number => n !== null);
      return [{ used: used.length > 0 ? Math.max(...used) : 0 }];
    }
    if (text.includes("FROM patients WHERE lower(email)")) return [];
    if (text.includes("FROM users WHERE lower(email)")) return h.users.filter(u => u.email === v[0]).map(u => ({ id: u.id }));
    if (text.includes("FROM users WHERE employee_id =")) {
      return h.users.filter(u => u.employee_id === v[0]).map(u => ({ id: u.id }));
    }
    if (text.includes("INSERT INTO users")) {
      const [employee_id, email, password_hash, first_name, last_name, contact_number, role] = v;
      const row: Row = {
        id: `staff-${++h.n}`, employee_id, email, password_hash, first_name, middle_name: null, last_name,
        contact_number, role, verified: true, status: "active", photo_url: null,
        archived_at: null, archived_by: null, archived_reason: null,
        created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z",
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
    throw new Error(`unexpected query: ${text}`);
  }),
}));
vi.mock("../../api/_lib/auth.js", () => ({
  getSessionFromRequest: () => ({ sub: "su-1", email: "super@admin.com", role: "superadmin" }),
}));

import handler from "../../api/staff";

type Res = { code?: number; body?: any };
function call(method: string, opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<Res> {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return (handler as any)({ method, query: opts.query ?? {}, body: opts.body, headers: {} }, res).then(() => res);
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
  h.users = [];
  h.n = 0;
});

describe("every staff account gets an Employee ID", () => {
  it("assigns the first one when nothing is typed", async () => {
    const res = await call("POST", { body: newStaff() });

    expect(res.code).toBe(201);
    expect(res.body.staff.employeeId).toBe("EMP-001");
  });

  it("carries on from the highest number already in use", async () => {
    h.users = [existing("EMP-001"), existing("EMP-012"), existing(null), existing("HR-99")];

    const res = await call("POST", { body: newStaff() });
    expect(res.body.staff.employeeId).toBe("EMP-013");
  });

  it("keeps a typed ID as given, and treats a blank one as not typed", async () => {
    const typed = await call("POST", { body: newStaff({ employeeId: "  EMP-100  " }) });
    expect(typed.body.staff.employeeId).toBe("EMP-100"); // trimmed

    const blank = await call("POST", { body: newStaff({ employeeId: "   ", email: "ana@ayagdental.com" }) });
    expect(blank.body.staff.employeeId).toBe("EMP-101"); // not stored as blank
  });

  it("still refuses an ID another account already has", async () => {
    h.users = [existing("EMP-007")];

    const res = await call("POST", { body: newStaff({ employeeId: "EMP-007" }) });
    expect(res.code).toBe(409);
    expect(h.users).toHaveLength(1);
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
