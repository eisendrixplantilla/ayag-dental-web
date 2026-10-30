import { describe, expect, it, vi } from "vitest";

// Runs the real api/dental-records.ts handler: each procedure of a record keeps the teeth it
// was done on, and each tooth its chart codes. The database is a small in-memory pair of tables for what saving one touches.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({ treatments: [] as Row[], altered: 0, n: 0, codes: null as string | null, notes: null as string | null }));

vi.mock("../../api/_lib/db.js", () => {
  const run = async (text: string, v: any[]): Promise<Row[]> => {
    if (text.includes("treatment-teeth-column")) { h.altered += 1; return []; }
    if (text.includes("tooth-codes-column") || text.includes("tooth-notes-column")) return [];
    if (text.includes("SELECT id, date FROM appointments")) return [{ id: "apt-1", date: "2026-10-01" }];
    if (text.includes("INSERT INTO dental_records")) { h.codes = v[4]; h.notes = v[5]; return [{ id: "rec-1" }]; }
    if (text.includes("DELETE FROM treatments")) { h.treatments = h.treatments.filter((t) => t.record_id !== v[0]); return []; }
    if (text.includes("SELECT id FROM services")) return [{ id: `svc-${v[0][0]}` }];
    if (text.includes("INSERT INTO treatments")) {
      const [record_id, service_id, teeth] = v;
      h.treatments.push({ id: `t${++h.n}`, record_id, service_id, teeth, service_name: service_id.replace("svc-", "") });
      return [];
    }
    if (text.includes("FROM dental_records dr")) {
      return [{ id: "rec-1", appointment_id: "apt-1", date: "2026-10-01", diagnosis: "Caries", tooth_number: "16, 26",
        tooth_codes: h.codes ? JSON.parse(h.codes) : null, tooth_notes: h.notes ? JSON.parse(h.notes) : null, created_at: "" }];
    }
    if (text.includes("FROM treatments t")) return h.treatments.filter((t) => v[0].includes(t.record_id));
    if (text.includes("FROM prescriptions")) return [];
    throw new Error(`unexpected query: ${text}`);
  };
  const sql = vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => run(strings.join("?"), v));
  return { sql: Object.assign(sql, { query: vi.fn(async (text: string, v: any[]) => run(text, v)) }) };
});
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => ({ sub: "d1", email: "d@x.y", role: "dentist" }) }));

import handler from "../../api/dental-records";

function call(method: string, body: Record<string, unknown>, query: Record<string, string> = {}) {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return (handler as any)({ method, query, body }, res).then(() => res);
}

describe("the dental chart on a record", () => {
  it("saves each procedure's teeth and each tooth's codes, and reads them back", async () => {
    const res = await call("POST", {
      appointmentId: "apt-1", diagnosis: "Caries", toothNumber: "16, 26",
      // The chart codes per tooth; a tooth that isn't one, or a list that isn't, is left out.
      toothCodes: { 16: ["D", "Am", "D"], 26: [], 99: ["X"], abc: ["X"], 36: "X" },
      // A note per tooth, trimmed; an empty one, or one on a tooth that isn't, is left out.
      toothNotes: { 16: "  Sensitive to cold  ", 26: "   ", 99: "nope" },
      treatments: [{ serviceName: "Oral", teeth: "16, 26" }, { serviceName: "Root Canal", teeth: "16" }, { serviceName: "Scaling" }],
    });
    expect(res.code).toBe(201);
    expect(h.treatments.map((t) => [t.service_name, t.teeth])).toEqual([["Oral", "16, 26"], ["Root Canal", "16"], ["Scaling", null]]);
    expect(res.body.record.treatments.map((t: Row) => [t.serviceName, t.teeth])).toEqual(
      [["Oral", "16, 26"], ["Root Canal", "16"], ["Scaling", null]],
    );
    expect(res.body.record.toothCodes).toEqual({ 16: ["D", "Am"] });
    expect(res.body.record.toothNotes).toEqual({ 16: "Sensitive to cold" });
    // The columns are made sure of once, not on every query.
    expect(h.altered).toBe(1);
  });
});
