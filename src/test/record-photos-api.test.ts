import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real photos handler behind api/dental-records.ts against a fake database that
// keeps one record's photos, so adding, relabelling, removing and who may see them show.
const h = vi.hoisted(() => ({
  session: { sub: "dr-1", email: "d@x.y", role: "dentist" } as { sub: string; email: string; role: string },
  photos: [] as Record<string, unknown>[],
  next: 1,
}));

vi.mock("../../api/_lib/db.js", () => {
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("record-photos-table") || text.includes("record-photos-index")) return [];
    if (text.includes("record-photos-record")) return values[0] === "rec-1" ? [{ id: "rec-1" }] : [];
    if (text.includes("record-photos-taker")) return [{ first_name: "Mike", last_name: "Johnson" }];
    if (text.includes("record-photos-count")) {
      const [recordId, kind] = values;
      return [{ n: h.photos.filter((p) => p.record_id === recordId && p.kind === kind).length }];
    }
    if (text.includes("record-photos-list")) return h.photos.filter((p) => p.record_id === values[0]);
    if (text.includes("record-photos-save")) {
      const [record_id, kind, label, image, taken_by] = values;
      const row = { id: `ph-${h.next++}`, record_id, kind, label, image, taken_by, created_at: "2026-11-01T02:00:00Z" };
      h.photos.push(row);
      return [row];
    }
    if (text.includes("record-photos-label")) {
      const [label, id] = values;
      const row = h.photos.find((p) => p.id === id);
      if (row) row.label = label;
      return row ? [row] : [];
    }
    if (text.includes("record-photos-delete")) {
      const i = h.photos.findIndex((p) => p.id === values[0]);
      return i < 0 ? [] : h.photos.splice(i, 1);
    }
    throw new Error(`unexpected query: ${text}`);
  });
  return { sql: Object.assign(sql, { query: sql }) };
});
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => h.session }));

import handler from "../../api/dental-records";

function call(method: string, query: Record<string, string>, body?: Record<string, unknown>) {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return (handler as any)({ method, query, body }, res).then(() => res);
}

const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const add = (over: Record<string, unknown> = {}) =>
  call("POST", { photos: "true" }, { recordId: "rec-1", kind: "before", label: "Front", image: JPEG, ...over });

beforeEach(() => {
  h.session = { sub: "dr-1", email: "d@x.y", role: "dentist" };
  h.photos = [];
  h.next = 1;
});

describe("a dental record's photos", () => {
  it("are added before and after, labelled, with who took them, and listed back", async () => {
    const res = await add();
    expect(res.code).toBe(201);
    expect(res.body.photo).toMatchObject({ id: "ph-1", recordId: "rec-1", kind: "before", label: "Front", image: JPEG, takenBy: "Mike Johnson" });
    await add({ kind: "after", label: "Not a view" });

    const list = await call("GET", { photos: "rec-1" });
    expect(list.body.photos.map((p: any) => [p.kind, p.label])).toEqual([["before", "Front"], ["after", null]]);
  });

  it("can be relabelled and taken off", async () => {
    await add();
    expect((await call("PATCH", { photo: "ph-1" }, { label: "Upper" })).body.photo.label).toBe("Upper");
    expect((await call("DELETE", { photo: "ph-1" })).code).toBe(200);
    expect(h.photos).toEqual([]);
    expect((await call("DELETE", { photo: "ph-1" })).code).toBe(404);
  });

  it("take only a JPEG of a sensible size, on a record that exists", async () => {
    expect((await add({ image: "data:image/png;base64,iVBORw0KGgo=" })).code).toBe(400);
    expect((await add({ image: `data:image/jpeg;base64,${"A".repeat(800_000)}` })).code).toBe(400);
    expect((await add({ kind: "during" })).code).toBe(400);
    expect((await add({ recordId: "rec-404" })).code).toBe(404);
    expect(h.photos).toEqual([]);
  });

  it("hold up to six of each", async () => {
    for (let i = 0; i < 6; i++) expect((await add()).code).toBe(201);
    const seventh = await add();
    expect(seventh.code).toBe(409);
    expect(seventh.body.error).toMatch(/up to 6 before photos/);
    expect((await add({ kind: "after" })).code).toBe(201);
  });

  it("are for dentists only: not the patient, not the front desk", async () => {
    await add();
    for (const role of ["patient", "admin", "superadmin"]) {
      h.session = { sub: "someone", email: "s@x.y", role };
      expect((await call("GET", { photos: "rec-1" })).code).toBe(403);
      expect((await add()).code).toBe(403);
      expect((await call("DELETE", { photo: "ph-1" })).code).toBe(403);
    }
    expect(h.photos).toHaveLength(1);
  });
});
