import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The handlers are mocked away in every other test, so a query that names a column the
// table doesn't have passes everything and fails in production. This reads the real
// schema and checks the joins against it.
const root = path.resolve(__dirname, "../..");
const schema = fs.readFileSync(path.join(root, "api/_db/schema.ts"), "utf8");
// The one-shot migrations drop columns the original CREATE TABLE still lists (users.name).
const migrations = fs.readFileSync(path.join(root, "api/admin/db.ts"), "utf8");

/** Every column `CREATE TABLE <name>` declares, plus whatever is added by ALTER, less what a migration drops. */
function columnsOf(table: string): Set<string> {
  const create = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`).exec(schema);
  const columns = new Set<string>();
  for (const line of (create?.[1] ?? "").split("\n")) {
    const m = /^\s{2}([a-z_]+)\s/.exec(line);
    if (m && !["primary", "unique", "foreign", "check", "constraint"].includes(m[1])) columns.add(m[1]);
  }
  for (const m of schema.matchAll(new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ([a-z_]+)`, "g"))) {
    columns.add(m[1]);
  }
  for (const m of migrations.matchAll(new RegExp(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ([a-z_]+)`, "g"))) {
    columns.delete(m[1]);
  }
  return columns;
}

const apiFiles = fs
  .readdirSync(path.join(root, "api"), { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".ts") && !f.includes("_db"))
  .map((f) => path.join(root, "api", f));

describe("the columns the handlers join on", () => {
  it("knows which columns each table really has", () => {
    // A guard on the guard: if the schema is ever restructured, this test must not
    // quietly start passing because it found nothing.
    expect(columnsOf("patients").has("id")).toBe(true);
    expect(columnsOf("patients").has("first_name")).toBe(true);
    expect(columnsOf("patients").has("archived_at")).toBe(true); // added by ALTER
    expect(columnsOf("patients").has("patient_id")).toBe(false);
    expect(columnsOf("services").has("sort_order")).toBe(true);
    expect(columnsOf("users").has("name")).toBe(false); // dropped by migrate_v2
  });

  it("only selects columns the table has", () => {
    const wrong: string[] = [];
    // The migrations read the old columns on purpose, before they drop them.
    for (const file of apiFiles.filter((f) => !f.endsWith(path.join("admin", "db.ts")))) {
      const source = fs.readFileSync(file, "utf8");
      // A plain list straight off one table, e.g. "SELECT first_name, last_name FROM users"
      for (const m of source.matchAll(/SELECT\s+([a-z_]+(?:\s*,\s*[a-z_]+)*)\s+FROM\s+([a-z_]+)\b/g)) {
        const [, list, table] = m;
        const columns = columnsOf(table);
        if (columns.size === 0) continue;
        for (const column of list.split(",").map((c) => c.trim())) {
          if (!columns.has(column)) wrong.push(`${path.relative(root, file)}: ${table}.${column}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("only joins on columns the table declares", () => {
    const wrong: string[] = [];
    for (const file of apiFiles) {
      const source = fs.readFileSync(file, "utf8");
      // e.g. "LEFT JOIN patients p ON p.id = a.patient_id"
      for (const m of source.matchAll(/JOIN\s+([a-z_]+)\s+([a-z]+)\s+ON\s+\2\.([a-z_]+)/g)) {
        const [, table, , column] = m;
        const columns = columnsOf(table);
        if (columns.size > 0 && !columns.has(column)) {
          wrong.push(`${path.relative(root, file)}: ${table}.${column}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
