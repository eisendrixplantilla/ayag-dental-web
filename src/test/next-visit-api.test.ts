import { describe, expect, it, vi } from "vitest";

// Runs the real api/dental-records.ts handler: a dental record's next visit can't be
// set in the past. The database answers only what's needed before the record is
// saved; past that point the fake records that a save was reached.
const h = vi.hoisted(() => ({ saved: 0, stored: "2020-01-15" as string | null }));

vi.mock("../../api/_lib/db.js", () => {
  const sql = vi.fn(async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("SELECT id, date FROM appointments")) return [{ id: "apt-1", date: "2026-10-01" }];
    if (text.includes("SELECT id, next_visit FROM dental_records")) return [{ id: "rec-1", next_visit: h.stored }];
    // The save itself, and everything after it.
    h.saved += 1;
    throw new Error("saved");
  });
  return { sql: Object.assign(sql, { query: sql }) };
});
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => ({ sub: "d1", email: "d@x.y", role: "dentist" }) }));

import handler from "../../api/dental-records";

function call(method: string, body: Record<string, unknown>, query: Record<string, string> = {}) {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return (handler as any)({ method, query, body }, res).then(() => res, () => res);
}

describe("a record's next visit", () => {
  it("can't be set in the past on a new record", async () => {
    h.saved = 0;
    const res = await call("POST", { appointmentId: "apt-1", diagnosis: "Caries", nextVisit: "2020-01-01" });
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/can't be in the past/);
    expect(h.saved).toBe(0);
  });

  it("can be today or later", async () => {
    h.saved = 0;
    await call("POST", { appointmentId: "apt-1", diagnosis: "Caries", nextVisit: "2099-01-01" });
    expect(h.saved).toBeGreaterThan(0);
  });

  it("can't be moved into the past when editing", async () => {
    h.saved = 0;
    const res = await call("PATCH", { nextVisit: "2020-02-01" }, { id: "rec-1" });
    expect(res.code).toBe(400);
    expect(h.saved).toBe(0);
  });

  it("leaves an old record's passed next visit editable as it is", async () => {
    h.saved = 0;
    await call("PATCH", { diagnosis: "Updated", nextVisit: "2020-01-15" }, { id: "rec-1" });
    expect(h.saved).toBeGreaterThan(0);
  });
});
