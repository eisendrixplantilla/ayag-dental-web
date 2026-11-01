import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/dental-records.ts handler: a dentist's list holds the records of their own
// visits, a patient's history holds everyone's, and only the visit's own dentist (or the front
// desk) can write its record. The fake answers the reads; past them it notes that a save was reached.
const h = vi.hoisted(() => ({
  session: { sub: "dr-1", email: "d@x.y", role: "dentist" } as { sub: string; email: string; role: string },
  own: true,
  lists: [] as { text: string; params: unknown[] }[],
  saved: 0,
}));

vi.mock("../../api/_lib/db.js", () => {
  const run = async (text: string, params: unknown[]) => {
    if (text.includes("own-check")) return [{ own: h.own }];
    if (/(treatment-teeth|tooth-codes|tooth-notes)-column/.test(text)) return [];
    if (text.includes("SELECT id, date FROM appointments")) return [{ id: "apt-1", date: "2026-10-01" }];
    if (text.includes("SELECT id, next_visit FROM dental_records")) return [{ id: "rec-1", next_visit: null }];
    if (text.includes("FROM dental_records dr") && text.includes("ORDER BY")) { h.lists.push({ text, params }); return []; }
    h.saved += 1;
    throw new Error("saved");
  };
  const sql = vi.fn(async (strings: TemplateStringsArray, ...v: unknown[]) => run(strings.join("?"), v));
  return { sql: Object.assign(sql, { query: vi.fn(async (text: string, v: unknown[] = []) => run(text, v)) }) };
});
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => h.session }));

import handler from "../../api/dental-records";

function call(method: string, query: Record<string, string> = {}, body?: Record<string, unknown>) {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return (handler as any)({ method, query, body }, res).then(() => res, () => res);
}

beforeEach(() => {
  h.session = { sub: "dr-1", email: "d@x.y", role: "dentist" };
  h.own = true;
  h.lists = [];
  h.saved = 0;
});

describe("whose dental records a dentist sees", () => {
  it("their own list holds only the records of their own visits", async () => {
    await call("GET");
    expect(h.lists[0].text).toMatch(/a\.dentist_id = \$1 OR \(a\.dentist_id IS NULL AND a\.dentist_name =/);
    expect(h.lists[0].params).toEqual(["dr-1"]);
  });

  it("a patient's history holds every dentist's records", async () => {
    await call("GET", { patientId: "pt-1" });
    expect(h.lists[0].text).not.toMatch(/WHERE[\s\S]*dentist_id/);
    expect(h.lists[0].params).toEqual(["pt-1"]);
  });

  it("the front desk and the superadmin see every record", async () => {
    for (const role of ["admin", "superadmin"]) {
      h.session = { sub: "staff-1", email: "s@x.y", role };
      h.lists = [];
      await call("GET");
      expect(h.lists[0].text).not.toMatch(/WHERE[\s\S]*dentist_id/);
    }
  });
});

describe("who writes a dental record", () => {
  it("a dentist can't write the record of another dentist's visit", async () => {
    h.own = false;
    const created = await call("POST", {}, { appointmentId: "apt-1", diagnosis: "Caries" });
    expect(created.code).toBe(403);
    expect(created.body.error).toMatch(/another dentist's/);
    const edited = await call("PATCH", { id: "rec-1" }, { diagnosis: "Changed" });
    expect(edited.code).toBe(403);
    expect(h.saved).toBe(0);
  });

  it("a dentist writes the record of their own visit", async () => {
    await call("POST", {}, { appointmentId: "apt-1", diagnosis: "Caries" });
    await call("PATCH", { id: "rec-1" }, { diagnosis: "Changed" });
    expect(h.saved).toBe(2);
  });

  it("the front desk writes any visit's record", async () => {
    h.session = { sub: "admin-1", email: "a@x.y", role: "admin" };
    h.own = false;
    await call("PATCH", { id: "rec-1" }, { diagnosis: "Changed" });
    expect(h.saved).toBe(1);
  });
});
