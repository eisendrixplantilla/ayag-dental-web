import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/dental-records.ts handler for the services branch. The database is
// a small in-memory `services`/`treatments` pair that answers the handful of queries
// the delete path makes; the session is the Super Admin, the only role allowed here.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  services: [] as Row[],
  treatments: [] as Row[],
  role: "superadmin" as string,
}));

vi.mock("../../api/_lib/db.js", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join("?");
    if (text.includes("SELECT service_name, removed_at FROM services")) {
      return h.services.filter(s => s.id === v[0]).map(s => ({ service_name: s.service_name, removed_at: s.removed_at }));
    }
    if (text.includes("FROM treatments WHERE service_id")) {
      return [{ n: h.treatments.filter(t => t.service_id === v[0]).length }];
    }
    if (text.includes("DELETE FROM services")) {
      h.services = h.services.filter(s => s.id !== v[0]);
      return [];
    }
    throw new Error(`unexpected query: ${text}`);
  }),
}));

vi.mock("../../api/_lib/auth.js", () => ({
  getSessionFromRequest: () => ({ sub: "su-1", email: "super@admin.com", role: h.role }),
}));

import handler from "../../api/dental-records";

const call = async (query: Record<string, string>) => {
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
  await handler({ method: "DELETE", query, body: {}, headers: {} } as any, res);
  return res;
};

beforeEach(() => {
  h.role = "superadmin";
  h.services = [
    { id: "sv-junk", service_name: "dsdsds", removed_at: "2026-09-24" },
    { id: "sv-clean", service_name: "Dental Cleaning", removed_at: "2026-09-25" },
    { id: "sv-live", service_name: "Oral", removed_at: null },
  ];
  h.treatments = [{ id: "t1", service_id: "sv-junk" }];
});

describe("deleting a service for good", () => {
  it("deletes one that is removed and that nothing points at", async () => {
    const res = await call({ services: "true", id: "sv-clean" });
    expect(res.statusCode).toBe(200);
    expect(h.services.map(s => s.id)).toEqual(["sv-junk", "sv-live"]);
  });

  it("refuses one a dental record still names, and says how many", async () => {
    const res = await call({ services: "true", id: "sv-junk" });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/named by 1 dental record treatment/);
    // The row stays, so the record keeps saying what it said.
    expect(h.services.map(s => s.id)).toContain("sv-junk");
  });

  it("refuses one that is still on offer — it has to be removed first", async () => {
    const res = await call({ services: "true", id: "sv-live" });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/Remove the service first/);
    expect(h.services.map(s => s.id)).toContain("sv-live");
  });

  it("is the Super Admin's alone", async () => {
    h.role = "admin";
    const res = await call({ services: "true", id: "sv-clean" });
    expect(res.statusCode).toBe(403);
    expect(h.services).toHaveLength(3);
  });

  it("says so when there is no such service", async () => {
    const res = await call({ services: "true", id: "sv-nope" });
    expect(res.statusCode).toBe(404);
  });
});
