import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/patients/index.ts GET handler against a one-row in-memory table.
// A patient row carries an address, a blood type and allergies, so who may read one
// matters as much as what it returns.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  rows: [] as Row[],
  queries: [] as string[],
  updates: [] as { text: string; values: any[] }[],
  session: { sub: "p-1", email: "maria@example.com", role: "patient" } as Row | null,
}));

vi.mock("../../api/_lib/db.js", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join("?");
    h.queries.push(text);
    if (text.includes("UPDATE patients SET")) {
      h.updates.push({ text, values: v });
      return [];
    }
    if (text.includes("SELECT * FROM patients WHERE id")) return h.rows.filter(r => r.id === v[0]);
    if (text.includes("FROM patients WHERE archived_at IS NOT NULL")) return [];
    if (text.includes("FROM patients WHERE archived_at IS NULL")) return h.rows;
    if (text.includes("COUNT(*)")) return [{ c: 0 }];
    throw new Error(`unexpected query: ${text}`);
  }),
}));

vi.mock("../../api/_lib/auth.js", () => ({
  getSessionFromRequest: () => h.session,
}));

import handler from "../../api/patients/index";

const MARIA = {
  id: "p-1",
  email: "maria@example.com",
  first_name: "Maria",
  middle_name: "Lourdes",
  last_name: "Santos",
  birthdate: "1998-04-12",
  age: null,
  sex: "Female",
  address: "12 Rizal St, Cabanatuan",
  contact_number: "0917 555 1234",
  blood_type: "O+",
  allergies: "Penicillin",
  status: "active",
  verified: true,
  photo_url: null,
  last_login: null,
  archived_at: null,
  archived_by: null,
  created_at: "2025-02-03T00:00:00.000Z",
};

const get = async (query: Record<string, string> = {}) => {
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
  await handler({ method: "GET", query, body: {} } as any, res);
  return res;
};

const patch = async (id: string, body: Record<string, unknown>) => {
  const res: any = {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
  await handler({ method: "PATCH", query: { id }, body } as any, res);
  return res;
};

beforeEach(() => {
  h.rows = [MARIA, { ...MARIA, id: "p-2", email: "other@example.com", first_name: "Other" }];
  h.queries = [];
  h.updates = [];
  h.session = { sub: "p-1", email: "maria@example.com", role: "patient" };
});

describe("reading a patient record", () => {
  it("lets a patient read their own row", async () => {
    const res = await get({ id: "p-1" });
    expect(res.statusCode).toBe(200);
    expect(res.body.patient.name).toBe("Maria Lourdes Santos");
  });

  it("refuses a patient asking for someone else's row, without touching the table", async () => {
    const res = await get({ id: "p-2" });
    expect(res.statusCode).toBe(403);
    expect(res.body.patient).toBeUndefined();
    expect(h.queries).toEqual([]);
  });

  it("refuses a patient asking for the whole list", async () => {
    const res = await get();
    expect(res.statusCode).toBe(403);
    expect(h.queries).toEqual([]);
  });

  it("still lets the front desk read any row, and the whole list", async () => {
    h.session = { sub: "a-1", email: "admin@admin.com", role: "admin" };
    expect((await get({ id: "p-2" })).statusCode).toBe(200);
    const list = await get();
    expect(list.statusCode).toBe(200);
    expect(list.body.patients).toHaveLength(2);
  });

  it("still lets a dentist read the list their patient pages are built from", async () => {
    h.session = { sub: "d-1", email: "mike@ayagdental.com", role: "dentist" };
    expect((await get()).statusCode).toBe(200);
  });

  it("turns nobody away without a session", async () => {
    h.session = null;
    expect((await get({ id: "p-1" })).statusCode).toBe(401);
  });
});

describe("the fields a patient record hands back", () => {
  it("includes the birthdate and name parts the table stores", async () => {
    const { body } = await get({ id: "p-1" });
    expect(body.patient.birthdate).toBe("1998-04-12");
    expect(body.patient.firstName).toBe("Maria");
    expect(body.patient.middleName).toBe("Lourdes");
    expect(body.patient.lastName).toBe("Santos");
    expect(body.patient.gender).toBe("Female");
    expect(body.patient.bloodType).toBe("O+");
  });
});

describe("editing personal details", () => {
  it("saves a patient's own birthdate, and derives the stored age from it", async () => {
    const res = await patch("p-1", { birthdate: "1997-03-01", gender: "Female", bloodType: "AB-", allergies: "Latex" });
    expect(res.statusCode).toBe(200);
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].values).toContain("1997-03-01");
    expect(h.updates[0].values).toContain("AB-");
    // The age column is computed from the birthdate rather than taken from the request,
    // so the two can never disagree on the pages that read `age`.
    expect(h.updates[0].text).toContain("date_part('year', age(");
  });

  it("refuses a birthdate in the future", async () => {
    const res = await patch("p-1", { birthdate: "2099-01-01" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/future/i);
    expect(h.updates).toEqual([]);
  });

  it("refuses a birthdate that isn't a date", async () => {
    for (const bad of ["not-a-date", "01/02/1998", "1998-13-45"]) {
      h.updates = [];
      const res = await patch("p-1", { birthdate: bad });
      expect(res.statusCode).toBe(400);
      expect(h.updates).toEqual([]);
    }
  });

  it("leaves the birthdate alone when none is sent", async () => {
    const res = await patch("p-1", { allergies: "None" });
    expect(res.statusCode).toBe(200);
    expect(h.updates[0].values).not.toContain("1998-04-12");
  });

  it("won't let one patient edit another's details", async () => {
    const res = await patch("p-2", { allergies: "Latex" });
    expect(res.statusCode).toBe(401);
    expect(h.updates).toEqual([]);
  });

  it("won't let a patient set their own account status", async () => {
    const res = await patch("p-1", { status: "active" });
    expect(res.statusCode).toBe(403);
    expect(h.updates).toEqual([]);
  });

  it("still lets the front desk edit a patient's details", async () => {
    h.session = { sub: "a-1", email: "admin@admin.com", role: "admin" };
    const res = await patch("p-2", { birthdate: "1980-06-15", status: "inactive" });
    expect(res.statusCode).toBe(200);
    expect(h.updates[0].values).toContain("1980-06-15");
  });
});
