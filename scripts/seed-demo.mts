// Demo data for showing the system: the built-in demo accounts (a patient and a second
// dentist, with a schedule) and sample patients, walk-ins, appointments in every status and
// dental records, from July to mid-December 2026 so the dashboards and reports have months
// to show. Writes to the database in .env.local.dev, which is the LIVE database.
//
//   npx tsx scripts/seed-demo.mts                    dry run: shows what it would add
//   npx tsx scripts/seed-demo.mts --apply            adds it (replaces earlier samples), in one transaction
//   npx tsx scripts/seed-demo.mts --clean            dry run: shows what --clean would remove
//   npx tsx scripts/seed-demo.mts --clean --apply    removes the samples and the demo accounts
//
// Marked so cleanup removes exactly these rows: sample patients' emails end in
// @sample.ayag.test, sample appointments have created_by = 'sample-seed', and the demo
// accounts are user@user.com and dentist@ayagdental.com. The demo accounts get random
// passwords, written to demo-accounts.local (git-ignored): the built-in ones are in the
// repository, and a known dentist password would open every patient's records.
//
// The visits are generated (with a fixed seed, so a dry run shows exactly what --apply adds)
// and each is checked against the real rules: working days and hours, lunch, a dentist's
// days and daily limits per service, days off and approved leave, and no double booking.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");
const CLEAN = process.argv.includes("--clean");
const MARK = "sample-seed";
const SAMPLE_DOMAIN = "@sample.ayag.test";
const DEMO_PATIENT = { email: "user@user.com", first: "John", last: "Smith" };
const DEMO_DENTIST = { email: "dentist@ayagdental.com", first: "Dr. Mike", last: "Johnson" };
const AERHOL = "aint.mikuu@gmail.com";
const TODAY = "2026-11-01"; // Sunday: before it, visits are done with; from it, coming up.
const FROM = "2026-07-01";
const TO = "2026-12-18";

// Dates read as the server reads them: on a Manila-time PC every DATE would come back a day early.
process.env.TZ = "UTC";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env.local.dev"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const { sql } = await import(pathToFileURL(join(ROOT, "api/_lib/db.ts")).href);
const { default: bcrypt } = await import("bcryptjs");

// --- What's there already ---
const samplePatients = await sql`SELECT id FROM patients WHERE email LIKE ${"%" + SAMPLE_DOMAIN}`;
const [demoPatient] = await sql`SELECT id FROM patients WHERE lower(email) = ${DEMO_PATIENT.email}`;
const [demoDentist] = await sql`SELECT id FROM users WHERE lower(email) = ${DEMO_DENTIST.email}`;
// Samples, and the demo patient's bookings (made by this script, or by someone trying it out).
const sampleAppts = await sql`SELECT id FROM appointments
  WHERE created_by = ${MARK} OR patient_id = ANY(${[...samplePatients.map((p: any) => p.id), demoPatient?.id].filter(Boolean)}::uuid[])`;
const sampleApptIds = sampleAppts.map((a: any) => a.id as string);
const sampleRecords = await sql`SELECT id FROM dental_records WHERE appointment_id = ANY(${sampleApptIds}::uuid[])`;
const sampleRecordIds = sampleRecords.map((r: any) => r.id as string);

if (CLEAN) {
  console.log(APPLY ? "=== CLEANING ===" : "=== DRY RUN (clean): nothing is changed ===");
  console.log(`  sample patients     ${samplePatients.length}`);
  console.log(`  appointments        ${sampleApptIds.length}`);
  console.log(`  dental records      ${sampleRecordIds.length}`);
  console.log(`  demo accounts       ${[demoPatient && DEMO_PATIENT.email, demoDentist && DEMO_DENTIST.email].filter(Boolean).join(", ") || "none"}`);
  if (demoDentist) {
    const [{ n }] = await sql`SELECT count(*)::int n FROM appointments WHERE dentist_id = ${demoDentist.id} AND NOT (id = ANY(${sampleApptIds}::uuid[]))`;
    if (n) console.log(`  NOTE: ${n} other booking(s) with ${DEMO_DENTIST.first} ${DEMO_DENTIST.last} stay, without a dentist link.`);
  }
  if (!APPLY) { console.log("\nRun with --clean --apply to remove."); process.exit(0); }
  await sql.transaction([
    sql`DELETE FROM dental_records WHERE id = ANY(${sampleRecordIds}::uuid[])`,
    sql`DELETE FROM appointments WHERE id = ANY(${sampleApptIds}::uuid[])`,
    sql`DELETE FROM patients WHERE id = ANY(${samplePatients.map((p: any) => p.id)}::uuid[]) OR lower(email) = ${DEMO_PATIENT.email}`,
    sql`DELETE FROM users WHERE lower(email) = ${DEMO_DENTIST.email}`,
  ]);
  console.log("\nDONE. Samples and demo accounts removed.");
  process.exit(0);
}

// --- Same "random" every run ---
let seed = 20261101;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;

// --- The dentists ---
const [aerhol] = await sql`SELECT id, first_name, last_name FROM users WHERE lower(email) = ${AERHOL}`;
if (!aerhol) { console.error("STOP: Aerhol Gocalin's account wasn't found. Nothing was changed."); process.exit(1); }
const mikeId: string = demoDentist?.id ?? randomUUID();
const MIKE_DAYS = [2, 4, 6];
type Hours = { start: number; end: number; lunchStart: number; lunchEnd: number };
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const aerholDays = new Map<number, Hours>((await sql`SELECT day_of_week, start_time, end_time, lunch_start, lunch_end FROM dentist_schedules WHERE dentist_id = ${aerhol.id}`)
  .map((d: any) => [d.day_of_week, { start: toMin(d.start_time), end: toMin(d.end_time), lunchStart: toMin(d.lunch_start ?? "12:00"), lunchEnd: toMin(d.lunch_end ?? "13:00") }]));
// Per service: the days the dentist takes it and how many a day (none listed = any day, no cap).
const aerholRules = new Map<string, { days: number[]; limits: Record<string, number> }>((await sql`SELECT service_name, days, day_limits FROM dentist_service_hours WHERE dentist_id = ${aerhol.id}`)
  .map((r: any) => [r.service_name, { days: r.days ?? [], limits: r.day_limits ?? {} }]));
const dentists = [
  { id: aerhol.id as string, name: `${aerhol.first_name} ${aerhol.last_name}`, days: aerholDays, rules: aerholRules },
  { id: mikeId, name: `${DEMO_DENTIST.first} ${DEMO_DENTIST.last}`,
    days: new Map<number, Hours>(MIKE_DAYS.map((d) => [d, { start: 540, end: 1020, lunchStart: 720, lunchEnd: 780 }])), rules: new Map() },
];

// --- Services, with what a finished visit's record says ---
const svc = Object.fromEntries((await sql`SELECT id, service_name, duration FROM services`).map((s: any) => [s.service_name, { id: s.id as string, minutes: Number(s.duration) || 30 }]));
type Rx = [string, string, string];
const AMOX: Rx = ["Amoxicillin", "500 mg", "1 capsule every 8 hours for 7 days"];
const MEFENAMIC: Rx = ["Mefenamic Acid", "500 mg", "1 capsule every 6 hours as needed for pain"];
const IBU: Rx = ["Ibuprofen", "400 mg", "1 tablet every 6 hours after meals, as needed"];
const CHLOR: Rx = ["Chlorhexidine mouthwash", "0.12%", "Rinse 15 mL twice a day for 2 weeks"];
const molars = ["16", "17", "26", "27", "36", "37", "46", "47"];
const anyTooth = ["11", "12", "14", "15", "21", "24", "25", "34", "35", "44", "45", ...molars];
const SERVICES: Record<string, { weight: number; record: () => { diagnosis: string; tooth?: string; notes: string; nextWeeks?: number; rx?: Rx[] } }> = {
  "Oral": { weight: 6, record: () => pick([
    { diagnosis: "Mild plaque and tartar buildup", notes: "Scaling and polishing done. Advised flossing daily.", nextWeeks: 26 },
    { diagnosis: "Gingivitis", notes: "Scaling done. Advised warm salt-water rinse and soft brushing.", nextWeeks: 12, rx: [CHLOR] },
    { diagnosis: "Healthy teeth and gums", notes: "Routine cleaning. No caries found.", nextWeeks: 26 },
  ]) },
  "Restoration": { weight: 5, record: () => ({ diagnosis: pick(["Class I caries", "Class II caries", "Fractured old filling"]), tooth: pick(anyTooth), notes: "Composite filling placed and polished. Bite checked." }) },
  "EXO (Bunot)": { weight: 4, record: () => ({ diagnosis: pick(["Non-restorable decayed tooth", "Retained root tip", "Severely mobile tooth"]), tooth: pick(molars), notes: "Extraction under local anesthesia. Gauze given; no complications.", rx: [AMOX, MEFENAMIC] }) },
  "Root Canal": { weight: 2, record: () => ({ diagnosis: "Irreversible pulpitis", tooth: pick(molars), notes: "Access opening, cleaning and shaping done. Temporary filling placed.", nextWeeks: 3, rx: [IBU] }) },
  "Teeth Whitening": { weight: 2, record: () => ({ diagnosis: "Extrinsic staining", notes: "In-office whitening; about two shades lighter. Avoid coffee and tea for 48 hours." }) },
  "Denture (Pustiso)": { weight: 2, record: () => ({ diagnosis: "Partial edentulism", notes: "Impressions taken for a removable partial denture. Try-in next visit.", nextWeeks: 2 }) },
  "TMJ": { weight: 1, record: () => ({ diagnosis: "TMJ pain on opening", notes: "Soft diet and warm compress advised. Night guard recommended.", nextWeeks: 4, rx: [IBU] }) },
  "Orthodontics (Braces)": { weight: 2, record: () => ({ diagnosis: "Crowding of lower front teeth", notes: "Brackets checked and wires adjusted.", nextWeeks: 4 }) },
  "Fixed Bridge": { weight: 1, record: () => ({ diagnosis: "Missing tooth", tooth: pick(["36", "46"]), notes: "Abutments prepared; temporary bridge placed.", nextWeeks: 2 }) },
  "Implant": { weight: 1, record: () => ({ diagnosis: "Missing tooth, good bone support", tooth: pick(["36", "46", "26"]), notes: "Implant placed. Healing period before the crown.", nextWeeks: 12, rx: [AMOX, MEFENAMIC] }) },
};
const missing = Object.keys(SERVICES).filter((s) => !svc[s]);
if (missing.length) { console.error(`STOP: services not found: ${missing.join(", ")}. Nothing was changed.`); process.exit(1); }
const weighted = Object.entries(SERVICES).flatMap(([name, s]) => Array(s.weight).fill(name) as string[]);

// --- Sample patients (and the demo patient, who gets visits of their own) ---
const sample = [
  ["Maria", "Santos", "Female", "1990-03-14", "B+", "Penicillin", "San Isidro"], ["Juan", "Dela Cruz", "Male", "1985-07-22", "O+", "", "Bitas"],
  ["Ana", "Reyes", "Female", "2001-11-05", "A+", "", "Sumacab"], ["Paolo", "Garcia", "Male", "1978-01-30", "AB+", "", "Aduas"],
  ["Liza", "Mendoza", "Female", "1995-06-18", "O-", "Latex", "Kapitan Pepe"], ["Carlo", "Ramos", "Male", "1999-09-02", "A-", "", "Bangad"],
  ["Jasmine", "Torres", "Female", "2004-02-27", "B-", "", "Mabini Extension"], ["Ricardo", "Aquino", "Male", "1966-12-11", "O+", "Aspirin", "Caalibangbangan"],
  ["Bea", "Navarro", "Female", "1988-04-09", "AB-", "", "Daan Sarile"], ["Miguel", "Flores", "Male", "2010-08-15", "A+", "", "Valdefuente"],
  ["Grace", "Castillo", "Female", "1972-05-03", "B+", "Sulfa drugs", "Zulueta"], ["Nico", "Villanueva", "Male", "1993-10-28", "O+", "", "Hermogenes"],
].map(([first, last, sex, born, blood, allergies, brgy], i) => ({
  id: randomUUID(), first, last, sex, born, blood, allergies,
  email: `${first}.${last.replace(/\s/g, "")}`.toLowerCase() + SAMPLE_DOMAIN,
  phone: `0917123${String(4501 + i).padStart(4, "0")}`, address: `Brgy. ${brgy}, Cabanatuan City`,
}));
const johnId: string = demoPatient?.id ?? randomUUID();
const accounts = [...sample.map((p) => ({ id: p.id, name: `${p.first} ${p.last}`, email: p.email })), { id: johnId, name: `${DEMO_PATIENT.first} ${DEMO_PATIENT.last}`, email: DEMO_PATIENT.email }];
const guests = [
  ["Rosa Villanueva", "Female", 52], ["Mark Bautista", "Male", 34], ["Elena Cruz", "Female", 61],
  ["Ramon Pascual", "Male", 45], ["Joy Santiago", "Female", 27], ["Dante Lopez", "Male", 58],
].map(([name, gender, age], i) => ({ name: name as string, gender: gender as string, age: age as number, phone: `0918123${String(4506 + i).padStart(4, "0")}` }));
const ageOn = (born: string) => {
  const [y, m, d] = born.split("-").map(Number);
  return 2026 - y - (11 < m || (11 === m && 1 < d) ? 1 : 0);
};

// --- What's booked already, and when the dentists are off ---
const existing = await sql`
  SELECT dentist_id, to_char(date, 'YYYY-MM-DD') AS date, time, end_time, service FROM appointments
  WHERE status = ANY(${["pending", "confirmed", "rescheduled", "completed"]}::text[]) AND NOT (id = ANY(${sampleApptIds}::uuid[]))`;
const busy: { dentist: string; date: string; from: number; to: number }[] = existing
  .map((e: any) => ({ dentist: e.dentist_id, date: e.date, from: toMin(e.time), to: e.end_time ? toMin(e.end_time) : toMin(e.time) + 30 }));
const isoDay = (d: unknown) => new Date(d as string).toISOString().slice(0, 10);
const off: { dentist: string; date: string; from: number; to: number }[] = [
  ...(await sql`SELECT dentist_id, to_char(unavailable_date, 'YYYY-MM-DD') AS date, start_time, end_time FROM dentist_unavailable`)
    .map((u: any) => ({ dentist: u.dentist_id, date: u.date, from: u.start_time ? toMin(u.start_time) : 0, to: u.end_time ? toMin(u.end_time) : 1440 })),
  ...(await sql`SELECT dentist_id, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
      ARRAY(SELECT to_char(r, 'YYYY-MM-DD') FROM unnest(removed_dates) r) AS removed_dates, start_time, end_time
    FROM leave_requests WHERE status = 'approved'`).flatMap((l: any) => {
    const removed = new Set(((l.removed_dates ?? []) as unknown[]).map(isoDay));
    const out = [];
    for (let d = new Date(`${isoDay(l.start_date)}T00:00:00Z`); d <= new Date(`${isoDay(l.end_date)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      if (!removed.has(date)) out.push({ dentist: l.dentist_id, date, from: l.start_time ? toMin(l.start_time) : 0, to: l.end_time ? toMin(l.end_time) : 1440 });
    }
    return out;
  }),
];
// "dentist date service" -> how many that day, starting from the real bookings (one can hold several services).
const perDay = new Map<string, number>();
for (const e of existing as any[]) {
  for (const s of String(e.service).split(", ")) perDay.set(`${e.dentist_id} ${e.date} ${s}`, (perDay.get(`${e.dentist_id} ${e.date} ${s}`) ?? 0) + 1);
}
const patientDay = new Set<string>(); // "patient date": one visit a day each

// --- The visits ---
type Visit = { patient?: (typeof accounts)[number]; guest?: (typeof guests)[number]; dentist: (typeof dentists)[number]; service: string;
  date: string; from: number; to: number; status: string; reason: string | null; moved: number };
const visits: Visit[] = [];
const PAST_STATUS = ["completed", "completed", "completed", "completed", "completed", "completed", "completed", "cancelled", "rejected"];
const FUTURE_STATUS = ["confirmed", "confirmed", "confirmed", "pending", "pending", "pending", "rescheduled"];
const REASONS: Record<string, string[]> = {
  cancelled: ["Cancelled by the patient: schedule conflict.", "Cancelled by the patient: feeling unwell.", "Cancelled by the patient: out of town."],
  rejected: ["The dentist was fully booked at that hour. Please book another time.", "Please book the procedure on a longer slot."],
  rescheduled: ["Moved at the patient's request."],
};
for (let d = new Date(`${FROM}T00:00:00Z`); d <= new Date(`${TO}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
  const date = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  const past = date < TODAY;
  for (const dentist of dentists) {
    const hours = dentist.days.get(dow);
    // The demo dentist joined in September; Aerhol has been there all along.
    if (!hours || (dentist.id === mikeId && date < "2026-09-01")) continue;
    // Busier closer to now, a little quieter further out.
    const wanted = (chance(past ? 0.55 : 0.45) ? 1 : 0) + (chance(0.3) ? 1 : 0);
    for (let k = 0, tries = 0; k < wanted && tries < 30; tries++) {
      const service = pick(weighted);
      const rule = dentist.rules.get(service);
      if (rule && !rule.days.includes(dow)) continue;
      const cap = rule?.limits?.[String(dow)];
      const key = `${dentist.id} ${date} ${service}`;
      if (cap !== undefined && (perDay.get(key) ?? 0) >= cap) continue;
      const minutes = svc[service].minutes;
      const from = hours.start + 30 * Math.floor(rand() * ((hours.end - hours.start) / 30));
      const to = from + minutes;
      if (to > hours.end || (from < hours.lunchEnd && to > hours.lunchStart)) continue;
      const overlaps = (b: { dentist: string; date: string; from: number; to: number }) => b.dentist === dentist.id && b.date === date && from < b.to && to > b.from;
      if (busy.some(overlaps) || off.some(overlaps)) continue;
      const walkIn = chance(0.12);
      const patient = walkIn ? undefined : (chance(0.07) ? accounts[accounts.length - 1] : pick(accounts.slice(0, -1)));
      const guest = walkIn ? pick(guests) : undefined;
      const who = patient?.id ?? guest!.name;
      if (patientDay.has(`${who} ${date}`)) continue;
      // Walk-ins are seen there and then: done, or confirmed when coming up.
      const status = walkIn ? (past ? "completed" : "confirmed") : pick(past ? PAST_STATUS : FUTURE_STATUS);
      visits.push({ patient, guest, dentist, service, date, from, to, status, reason: REASONS[status] ? pick(REASONS[status]) : null, moved: status === "rescheduled" ? 1 : 0 });
      busy.push({ dentist: dentist.id, date, from, to });
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
      patientDay.add(`${who} ${date}`);
      k++;
    }
  }
}
// Each sample patient registered a week before their first visit (or in June, if none).
const firstVisit = new Map<string, string>();
for (const v of visits) if (v.patient && (!firstVisit.has(v.patient.id) || v.date < firstVisit.get(v.patient.id)!)) firstVisit.set(v.patient.id, v.date);
const joined = (id: string) => {
  const first = firstVisit.get(id);
  const d = new Date(`${first ?? "2026-06-22"}T01:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString();
};
const bookedOn = (date: string, from: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 2 - Math.floor(rand() * 9));
  return `${d.toISOString().slice(0, 10)}T${toTime(Math.max(0, from - 480))}:00Z`;
};

// --- A second look, independent of how the visits were picked: stop rather than write a bad one ---
const problems: string[] = [];
for (const v of visits) {
  const dow = new Date(`${v.date}T00:00:00Z`).getUTCDay();
  const hours = v.dentist.days.get(dow);
  const at = `${v.date} ${toTime(v.from)} ${v.dentist.name}`;
  if (!hours) problems.push(`${at}: not a working day`);
  else if (v.from < hours.start || v.to > hours.end || (v.from < hours.lunchEnd && v.to > hours.lunchStart)) problems.push(`${at}: outside hours or in lunch`);
  if (off.some((o) => o.dentist === v.dentist.id && o.date === v.date && v.from < o.to && v.to > o.from)) problems.push(`${at}: dentist off`);
  const clash = existing.some((e: any) => e.dentist_id === v.dentist.id && e.date === v.date
    && v.from < (e.end_time ? toMin(e.end_time) : toMin(e.time) + 30) && v.to > toMin(e.time));
  if (clash || visits.some((w) => w !== v && w.dentist === v.dentist && w.date === v.date && v.from < w.to && v.to > w.from)) problems.push(`${at}: double-booked`);
  const rule = v.dentist.rules.get(v.service);
  if (rule && !rule.days.includes(dow)) problems.push(`${at}: ${v.service} not taken that day`);
  if ((v.date < TODAY) !== ["completed", "cancelled", "rejected"].includes(v.status)) problems.push(`${at}: status ${v.status} on the wrong side of today`);
}
if (problems.length) {
  console.error(`STOP: ${problems.length} problem(s). Nothing was changed.\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

// --- Report ---
const count = (f: (v: Visit) => boolean) => visits.filter(f).length;
const done = visits.filter((v) => v.status === "completed");
const months = [...new Set(visits.map((v) => v.date.slice(0, 7)))];
console.log(APPLY ? "=== APPLYING ===" : "=== DRY RUN: nothing is changed ===");
console.log(`\nDemo accounts: ${DEMO_DENTIST.email} (${dentists[1].name}, dentist, Tue/Thu/Sat 9-5) ${demoDentist ? "already there, kept" : "new"}; ${DEMO_PATIENT.email} (John Smith, patient) ${demoPatient ? "already there, kept" : "new"}`);
console.log(`Sample patients (${sample.length}): ${sample.map((p) => `${p.first} ${p.last}`).join(", ")}`);
console.log(`Walk-in guests (${guests.length}): ${guests.map((g) => g.name).join(", ")}`);
console.log(`Replacing earlier samples: ${samplePatients.length} patients, ${sampleApptIds.length} appointments, ${sampleRecordIds.length} records`);
console.log(`\nAppointments: ${visits.length} (walk-ins ${count((v) => !!v.guest)}, John Smith ${count((v) => v.patient?.id === johnId)})`);
console.log(`  by status:  ${["completed", "cancelled", "rejected", "pending", "confirmed", "rescheduled"].map((s) => `${s} ${count((v) => v.status === s)}`).join(", ")}`);
console.log(`  by dentist: ${dentists.map((d) => `${d.name} ${count((v) => v.dentist === d)}`).join(", ")}`);
console.log(`  by month:   ${months.map((m) => `${m} ${count((v) => v.date.startsWith(m))}`).join(", ")}`);
console.log(`  by service: ${Object.keys(SERVICES).map((s) => `${s} ${count((v) => v.service === s)}`).join(", ")}`);
console.log(`Dental records: ${done.length} (one for each completed visit)`);
console.log(`\nComing up, first 12:`);
for (const v of visits.filter((x) => x.date >= TODAY).slice(0, 12)) {
  console.log(`  ${v.date} ${toTime(v.from)}-${toTime(v.to)}  ${(v.patient?.name ?? `${v.guest!.name} (walk-in)`).padEnd(26)} ${v.service.padEnd(22)} ${v.dentist.name.padEnd(16)} ${v.status}`);
}
console.log("\nChecks: each visit is on its dentist's day, inside working hours, clear of lunch, days off, leave and every other booking, within the per-service day rules.");
if (!APPLY) { console.log("\nDry run only. Run again with --apply to add it."); process.exit(0); }

// --- One transaction: everything or nothing ---
const passwords: Record<string, string> = {};
const password = () => randomBytes(9).toString("base64url");
const q: any[] = [
  sql`DELETE FROM dental_records WHERE id = ANY(${sampleRecordIds}::uuid[])`,
  sql`DELETE FROM appointments WHERE id = ANY(${sampleApptIds}::uuid[])`,
  sql`DELETE FROM patients WHERE id = ANY(${samplePatients.map((p: any) => p.id)}::uuid[])`,
];
if (!demoDentist) {
  passwords[DEMO_DENTIST.email] = password();
  q.push(sql`INSERT INTO users (id, email, password_hash, first_name, last_name, role, verified, status, created_at)
    VALUES (${mikeId}, ${DEMO_DENTIST.email}, ${await bcrypt.hash(passwords[DEMO_DENTIST.email], 10)}, ${DEMO_DENTIST.first}, ${DEMO_DENTIST.last}, 'dentist', TRUE, 'active', '2026-08-25T01:00:00Z')`);
  for (const day of MIKE_DAYS) {
    q.push(sql`INSERT INTO dentist_schedules (dentist_id, day_of_week, start_time, end_time, lunch_start, lunch_end, duration_minutes, max_patient)
      VALUES (${mikeId}, ${day}, '09:00', '17:00', '12:00', '13:00', 30, 20)`);
  }
}
if (!demoPatient) {
  passwords[DEMO_PATIENT.email] = password();
  q.push(sql`INSERT INTO patients (id, email, password_hash, first_name, last_name, birthdate, sex, age, contact_number, address, blood_type, allergies, verified, status, created_at)
    VALUES (${johnId}, ${DEMO_PATIENT.email}, ${await bcrypt.hash(passwords[DEMO_PATIENT.email], 10)}, ${DEMO_PATIENT.first}, ${DEMO_PATIENT.last},
      '1992-02-20', 'Male', 34, '09171230000', 'Brgy. Dicarma, Cabanatuan City', 'A+', '', TRUE, 'active', ${joined(johnId)})`);
}
for (const p of sample) {
  q.push(sql`INSERT INTO patients (id, email, first_name, last_name, birthdate, sex, age, address, contact_number, blood_type, allergies, verified, status, created_at)
    VALUES (${p.id}, ${p.email}, ${p.first}, ${p.last}, ${p.born}, ${p.sex}, ${ageOn(p.born)}, ${p.address}, ${p.phone}, ${p.blood}, ${p.allergies}, TRUE, 'active', ${joined(p.id)})`);
}
for (const v of visits) {
  const apptId = randomUUID();
  const created = bookedOn(v.date, v.from);
  q.push(sql`INSERT INTO appointments (id, patient_id, patient_name, contact, email, age, gender, dentist_id, dentist_name, service, date, time, end_time, type, status, reason, reschedule_count, created_by, created_at, updated_at)
    VALUES (${apptId}, ${v.patient?.id ?? null}, ${v.patient?.name ?? v.guest!.name}, ${v.guest?.phone ?? null}, ${v.patient?.email ?? null},
      ${v.guest?.age ?? null}, ${v.guest?.gender ?? null}, ${v.dentist.id}, ${v.dentist.name}, ${v.service}, ${v.date}, ${toTime(v.from)}, ${toTime(v.to)},
      ${v.guest ? "walk-in" : "online"}, ${v.status}, ${v.reason}, ${v.moved}, ${MARK}, ${created}, ${created})`);
  if (v.status === "completed") {
    const recordId = randomUUID();
    const r = SERVICES[v.service].record();
    let next: string | null = null;
    if (r.nextWeeks) { const n = new Date(`${v.date}T00:00:00Z`); n.setUTCDate(n.getUTCDate() + 7 * r.nextWeeks); next = n.toISOString().slice(0, 10); }
    q.push(sql`INSERT INTO dental_records (id, appointment_id, date, diagnosis, tooth_number, treatment_notes, next_visit, tooth_codes, tooth_notes, created_at, updated_at)
      VALUES (${recordId}, ${apptId}, ${v.date}, ${r.diagnosis}, ${r.tooth ?? null}, ${r.notes}, ${next}, '{}'::jsonb, '{}'::jsonb, ${`${v.date}T${toTime(Math.max(0, v.to - 480))}:00Z`}, ${`${v.date}T${toTime(Math.max(0, v.to - 480))}:00Z`})`);
    q.push(sql`INSERT INTO treatments (record_id, service_id, teeth) VALUES (${recordId}, ${svc[v.service].id}, ${r.tooth ?? null})`);
    for (const [medicine, dosage, instructions] of r.rx ?? []) {
      q.push(sql`INSERT INTO prescriptions (record_id, medicine, dosage, instructions) VALUES (${recordId}, ${medicine}, ${dosage}, ${instructions})`);
    }
  }
}
await sql.transaction(q);

// The app only numbers rows without an ID once per server instance, so rows written here would
// show "—" for Patient ID, Employee ID and reference until a cold start. Number them now.
const { assignCodes } = await import(pathToFileURL(join(ROOT, "api/_lib/codes.ts")).href);
const given = { patients: 0, staff: 0, appointments: 0 };
for (const kind of ["patients", "staff", "appointments"] as const) given[kind] = (await assignCodes(kind)).size;
console.log(`IDs given: ${given.patients} Patient IDs, ${given.staff} Employee IDs, ${given.appointments} appointment references.`);

if (Object.keys(passwords).length) {
  writeFileSync(join(ROOT, "demo-accounts.local"),
    `# Demo logins made by scripts/seed-demo.mts on ${new Date().toISOString()}. Git-ignored; keep it private.\n`
    + Object.entries(passwords).map(([email, pw]) => `${email}  ${pw}`).join("\n") + "\n");
}
console.log(`\nDONE. Added ${sample.length} sample patients, ${visits.length} appointments and ${done.length} dental records${Object.keys(passwords).length ? "; demo logins are in demo-accounts.local" : ""}.`);
