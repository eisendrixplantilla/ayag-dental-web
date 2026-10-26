// Sample data for trying "Link to account" on Patient Records: walk-in guests (no
// account) and the patient accounts they might belong to. Writes to the database in
// .env.local.dev — a test database, never the live one.
//
//   npx tsx scripts/seed-guest-samples.mts          add the samples (replaces earlier ones)
//   npx tsx scripts/seed-guest-samples.mts --clean  remove every sample row
//
// Sample accounts can log in (to try "show me your Profile") with their email below and
// the password SAMPLE_PASSWORD.
//
// Everything is marked so cleanup removes exactly these rows and nothing else:
// accounts use emails ending in @sample.ayag.test, walk-ins have created_by = 'sample-seed'.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SAMPLE_PASSWORD = "Sample@123";
const EMAIL_DOMAIN = "@sample.ayag.test";
const MARK = "sample-seed";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env.local.dev"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const { sql } = await import(pathToFileURL(join(ROOT, "api/_lib/db.ts")).href);
const { default: bcrypt } = await import("bcryptjs");

async function clean() {
  const accounts = (await sql`SELECT id FROM patients WHERE email LIKE ${"%" + EMAIL_DOMAIN}`).map((r: any) => r.id);
  // Real walk-ins (not samples) that were linked to a sample account while testing go
  // back to having no account, instead of being deleted with it.
  const restored = await sql`
    UPDATE appointments SET patient_id = NULL
    WHERE patient_id = ANY(${accounts}::uuid[]) AND type = 'walk-in' AND created_by IS DISTINCT FROM ${MARK}
    RETURNING id`;
  if (restored.length) console.log(`Unlinked ${restored.length} non-sample walk-in(s) from sample accounts (kept, not deleted).`);
  // Samples, plus anything booked online by a sample account itself.
  const appts = (await sql`
    SELECT id FROM appointments WHERE created_by = ${MARK} OR patient_id = ANY(${accounts}::uuid[])`).map((r: any) => r.id);
  await sql`DELETE FROM dental_records WHERE appointment_id = ANY(${appts}::uuid[])`;
  await sql`DELETE FROM appointments WHERE id = ANY(${appts}::uuid[])`;
  await sql`DELETE FROM otp_codes WHERE email LIKE ${"%" + EMAIL_DOMAIN}`;
  await sql`DELETE FROM patients WHERE id = ANY(${accounts}::uuid[])`;
  return { accounts: accounts.length, appointments: appts.length };
}

const removed = await clean();
console.log(`Removed earlier samples: ${removed.accounts} account(s), ${removed.appointments} appointment(s).`);
if (process.argv.includes("--clean")) process.exit(0);

const [dentist] = await sql`
  SELECT id, trim(first_name || ' ' || coalesce(last_name, '')) AS name FROM users
  WHERE role = 'dentist' AND coalesce(status, 'active') = 'active' ORDER BY created_at LIMIT 1`;
if (!dentist) throw new Error("No active dentist in this database to book the sample walk-ins with.");
const dentistName = dentist.name.startsWith("Dr") ? dentist.name : `Dr. ${dentist.name}`;

// Patient accounts, as if they had signed up online.
const hash = await bcrypt.hash(SAMPLE_PASSWORD, 10);
const accounts = [
  // Same person as guest Rosa: same number, but signed up with a middle initial -> name "Check".
  { first: "Rosa", middle: "M.", last: "Mendoza", phone: "0917-123-4567", sex: "Female", birthdate: "1994-03-02", email: "rosa.mendoza" },
  // Same person as guest Joaquin: everything matches.
  { first: "Joaquin", middle: null, last: "Villanueva", phone: "0918 222 3333", sex: "Male", birthdate: "1981-06-15", email: "joaquin.villanueva" },
  // A DIFFERENT Maria Santos: same name, different number and age -> should raise doubts.
  { first: "Maria", middle: null, last: "Santos", phone: "0920 777 8888", sex: "Female", birthdate: "1971-01-10", email: "maria.santos" },
];
for (const a of accounts) {
  await sql`
    INSERT INTO patients (email, password_hash, first_name, middle_name, last_name, contact_number, sex, birthdate, age, address, verified, status)
    VALUES (${a.email + EMAIL_DOMAIN}, ${hash}, ${a.first}, ${a.middle}, ${a.last}, ${a.phone}, ${a.sex}, ${a.birthdate},
            date_part('year', age(${a.birthdate}::date))::int, 'Sample address, Cabanatuan City', TRUE, 'active')`;
}

// Walk-ins booked at the desk with no account (patient_id empty).
const walkIns = [
  { name: "Rosa Mendoza", contact: "0917 123 4567", age: 32, gender: "Female", date: "2026-09-20", time: "09:00", end: "09:30", service: "Oral", record: true },
  { name: "Rosa Mendoza", contact: "0917 123 4567", age: 32, gender: "Female", date: "2026-10-05", time: "10:00", end: "10:30", service: "Restoration", record: false },
  { name: "Joaquin Villanueva", contact: "0918 222 3333", age: 45, gender: "Male", date: "2026-09-28", time: "13:00", end: "13:45", service: "EXO (Bunot)", record: true },
  { name: "Maria Santos", contact: "0919 444 5555", age: 28, gender: "Female", date: "2026-10-01", time: "14:00", end: "14:30", service: "Oral", record: false },
  // A DIFFERENT Rosa Mendoza (another number): listed as her own guest, never linked along with Rosa.
  { name: "Rosa Mendoza", contact: "0999 000 1111", age: 60, gender: "Female", date: "2026-10-02", time: "11:00", end: "11:30", service: "Oral", record: false },
  // No account at all: nothing to link to yet.
  { name: "Pedro Reyes", contact: "0921 666 7777", age: 60, gender: "Male", date: "2026-10-03", time: "15:00", end: "15:30", service: "Oral", record: false },
];
for (const w of walkIns) {
  const [appt] = await sql`
    INSERT INTO appointments (patient_id, patient_name, contact, age, gender, dentist_id, dentist_name, service, date, time, end_time, type, status, reason, created_by)
    VALUES (NULL, ${w.name}, ${w.contact}, ${w.age}, ${w.gender}, ${dentist.id}, ${dentistName}, ${w.service}, ${w.date}, ${w.time}, ${w.end},
            'walk-in', 'completed', 'Sample walk-in for testing', ${MARK})
    RETURNING id`;
  if (w.record) {
    await sql`
      INSERT INTO dental_records (appointment_id, date, diagnosis, tooth_number, treatment_notes)
      VALUES (${appt.id}, ${w.date}, 'Sample diagnosis', '16', 'Sample treatment notes — should move with the visit when linked.')`;
  }
}

console.log(`Added ${accounts.length} sample accounts and ${walkIns.length} guest walk-ins (dentist: ${dentistName}).`);
console.log("Remove them later with: npx tsx scripts/seed-guest-samples.mts --clean");
