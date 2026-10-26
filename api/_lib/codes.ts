import { sql } from "./db.js";

/**
 * The clinic's IDs: a prefix, the year and month the record was made (Manila time, the
 * year without its "20"), and its number among those made that month, from 1:
 *
 *   patient     PT-2610 0001   (4 digits)
 *   dentist     DT-2610 01     (2 digits)
 *   admin       AN-2610 01
 *   superadmin  SA-2610 01
 *   appointment APT-2610 00001 (5 digits)
 *
 * The number restarts each month. It grows past its width instead of failing, so the
 * hundredth dentist of a month is DT-2610100.
 *
 * Codes are given by one SQL statement per table (assignCodes), which numbers every row
 * still without a code of its kind, oldest first, after the month's highest so far. It
 * runs after each insert, and once on first use to give records made before these IDs
 * theirs: the live database isn't migrated on deploy. A row whose code no longer fits
 * (a staff account's role changed, an old EMP- Employee ID) is given a new one.
 */
export const DIGITS = { PT: 4, DT: 2, AN: 2, SA: 2, APT: 5 } as const;
export type Prefix = keyof typeof DIGITS;

/** The staff roles' prefixes. */
export const STAFF_PREFIX: Record<string, Prefix> = { dentist: "DT", admin: "AN", superadmin: "SA" };

/** Whether `code` is a well-formed ID with this prefix. */
export function isCode(prefix: Prefix, code: string | null | undefined): boolean {
  return !!code && new RegExp(`^${prefix}-[0-9]{${4 + DIGITS[prefix]},}$`).test(code);
}

interface Target {
  table: "patients" | "users" | "appointments";
  column: "patient_code" | "employee_id" | "reference";
  /** SQL giving each row's prefix. */
  prefix: string;
  /** SQL giving the width of each row's number. */
  digits: string;
  /** Which rows of the table take one. */
  scope?: string;
}

export const TARGETS: Record<"patients" | "staff" | "appointments", Target> = {
  patients: { table: "patients", column: "patient_code", prefix: "'PT'", digits: "4" },
  staff: {
    table: "users",
    column: "employee_id",
    prefix: "CASE role WHEN 'dentist' THEN 'DT' WHEN 'admin' THEN 'AN' ELSE 'SA' END",
    digits: "2",
    scope: "role IN ('dentist', 'admin', 'superadmin')",
  },
  appointments: { table: "appointments", column: "reference", prefix: "'APT'", digits: "5" },
};

/** The statement that numbers every row of `t` still without a code of its kind. */
export function assignSql(t: Target): string {
  const month = `to_char(created_at AT TIME ZONE 'Asia/Manila', 'YYMM')`;
  // Fits: prefix, dash, YYMM, then at least the number's width of digits.
  const fits = `${t.column} ~ ('^' || ${t.prefix} || '-[0-9]{' || (4 + ${t.digits}) || ',}$')`;
  return `/* assign-codes:${t.table} */
    WITH rows AS (
      SELECT id, created_at, ${t.column} AS code, ${t.prefix} AS prefix, ${month} AS ym, (${t.column} IS NOT NULL AND ${fits}) AS fits
      FROM ${t.table}${t.scope ? ` WHERE ${t.scope}` : ""}
    ),
    top AS (
      SELECT prefix, ym, max(substr(code, length(prefix) + 6)::bigint) AS n
      FROM rows WHERE fits AND substr(code, length(prefix) + 2, 4) = ym GROUP BY prefix, ym
    ),
    todo AS (
      SELECT r.id, r.prefix, r.ym, coalesce(top.n, 0) + row_number() OVER (PARTITION BY r.prefix, r.ym ORDER BY r.created_at, r.id) AS n
      FROM rows r LEFT JOIN top ON top.prefix = r.prefix AND top.ym = r.ym
      WHERE NOT r.fits
    )
    UPDATE ${t.table} x
    SET ${t.column} = todo.prefix || '-' || todo.ym || lpad(todo.n::text, greatest(${t.digits}, length(todo.n::text)), '0')
    FROM todo WHERE x.id = todo.id
    RETURNING x.id, x.${t.column} AS code`;
}

/** Postgres's "duplicate key": two numberings racing for the same code. */
const isDuplicate = (err: unknown) => (err as { code?: string })?.code === "23505";

/**
 * Gives every row of the kind still without a code its own, and returns the ones given
 * (id → code). Two runs at once can reach for the same number; the loser tries again.
 */
export async function assignCodes(kind: keyof typeof TARGETS): Promise<Map<string, string>> {
  const t = TARGETS[kind];
  for (let attempt = 0; ; attempt++) {
    try {
      const rows = await sql.query(assignSql(t)) as { id: string; code: string }[];
      return new Map(rows.map((r) => [r.id, r.code]));
    } catch (err) {
      if (!isDuplicate(err) || attempt >= 4) throw err;
    }
  }
}

/**
 * Records made before these IDs are given theirs, once per instance, on first use. The
 * column is added here too, for the live database. A failure is logged and tried again
 * next time, rather than breaking the page that asked.
 */
const ready: Partial<Record<keyof typeof TARGETS, Promise<void>>> = {};
export function ensureCodes(kind: keyof typeof TARGETS): Promise<void> {
  const t = TARGETS[kind];
  ready[kind] ??= (async () => {
    if (t.table !== "users") {
      await sql.query(`/* code-column:${t.table} */ ALTER TABLE ${t.table} ADD COLUMN IF NOT EXISTS ${t.column} TEXT UNIQUE`);
    }
    await assignCodes(kind);
  })().catch((err) => {
    delete ready[kind];
    console.error(`Could not give ${kind} their IDs`, err);
  });
  return ready[kind]!;
}
