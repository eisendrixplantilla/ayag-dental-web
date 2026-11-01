import { sql } from "./db.js";
import type { SessionPayload } from "./auth.js";

/**
 * SQL for "appointment `a` is this dentist's": by dentist_id, or, on older rows that only
 * carry the name, by the dentist's full name. `param` is the placeholder holding their id.
 */
export function ownAppointmentSql(param: string): string {
  return `(a.dentist_id = ${param} OR (a.dentist_id IS NULL AND a.dentist_name =
    (SELECT concat_ws(' ', first_name, NULLIF(middle_name, ''), last_name) FROM users WHERE id = ${param})))`;
}

const FROM = {
  appointment: `FROM appointments a WHERE a.id = $1`,
  record: `FROM dental_records dr JOIN appointments a ON a.id = dr.appointment_id WHERE dr.id = $1`,
  photo: `FROM record_photos p JOIN dental_records dr ON dr.id = p.record_id
    JOIN appointments a ON a.id = dr.appointment_id WHERE p.id = $1`,
};

/**
 * Whether a dentist is reaching for another dentist's work: an appointment, a dental
 * record, or a record's photo whose visit was someone else's. Dentists write only their
 * own; the front desk and the superadmin may write any. A row that isn't there is false,
 * so the caller's own "not found" answer still applies.
 */
export async function othersWork(session: SessionPayload, kind: keyof typeof FROM, id: string): Promise<boolean> {
  if (session.role !== "dentist") return false;
  const rows = await sql.query(`/* own-check:${kind} */ SELECT ${ownAppointmentSql("$2")} AS own ${FROM[kind]}`, [id, session.sub]) as { own: boolean | null }[];
  return rows.length > 0 && rows[0].own !== true;
}

export const NOT_YOURS = "This visit was another dentist's, so its record is theirs to change.";
