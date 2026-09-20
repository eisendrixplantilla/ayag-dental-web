import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { sql } from "../_lib/db.js";
import { SCHEMA_SQL } from "../_db/schema.js";
import { splitName } from "../_lib/name.js";

const DEFAULT_USERS = [
  { email: "admin@admin.com", name: "Dr. Sarah Chen", role: "admin", password: "admin123" },
  { email: "user@user.com", name: "John Smith", role: "patient", password: "user123" },
  { email: "super@admin.com", name: "Super Administrator", role: "superadmin", password: "super123" },
  { email: "dentist@ayagdental.com", name: "Dr. Mike Johnson", role: "dentist", password: "dentist123" },
];

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(SCHEMA_SQL);
  } finally {
    await pool.end();
  }
}

async function seed() {
  const created: string[] = [];
  for (const u of DEFAULT_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const { firstName, lastName } = splitName(u.name);

    if (u.role === "patient") {
      const existing = await sql`SELECT id FROM patients WHERE lower(email) = ${u.email}`;
      if (existing.length > 0) continue;
      await sql`
        INSERT INTO patients (email, password_hash, first_name, last_name, verified, status)
        VALUES (${u.email}, ${passwordHash}, ${firstName}, ${lastName}, TRUE, 'active')
      `;
    } else {
      const existing = await sql`SELECT id FROM users WHERE lower(email) = ${u.email}`;
      if (existing.length > 0) continue;
      await sql`
        INSERT INTO users (email, password_hash, first_name, last_name, role, verified, status)
        VALUES (${u.email}, ${passwordHash}, ${firstName}, ${lastName}, ${u.role}, TRUE, 'active')
      `;
    }
    created.push(u.email);
  }
  return created;
}

const DEFAULT_CLINIC_HOURS = [
  { day: "Monday", open: "08:00", close: "17:00", enabled: true },
  { day: "Tuesday", open: "08:00", close: "17:00", enabled: true },
  { day: "Wednesday", open: "08:00", close: "17:00", enabled: true },
  { day: "Thursday", open: "08:00", close: "17:00", enabled: true },
  { day: "Friday", open: "08:00", close: "17:00", enabled: true },
  { day: "Saturday", open: "09:00", close: "14:00", enabled: true },
  { day: "Sunday", open: "00:00", close: "00:00", enabled: false },
];

const DEFAULT_SERVICES = [
  { name: "Orthodontics (Braces)", duration: 60, price: 25000 },
  { name: "EXO (Bunot)", duration: 45, price: 3000 },
  { name: "Restoration", duration: 30, price: 2500 },
  { name: "Oral", duration: 30, price: 1500 },
  { name: "Venners", duration: 60, price: 15000 },
  { name: "Denture (Pustiso)", duration: 60, price: 12000 },
  { name: "Implant", duration: 90, price: 35000 },
  { name: "Surgery", duration: 90, price: 20000 },
  { name: "TMJ", duration: 45, price: 5000 },
  { name: "Root Canal", duration: 90, price: 8000 },
  { name: "Teeth Whitening", duration: 60, price: 5000 },
  { name: "Fixed Bridge", duration: 60, price: 18000 },
];

async function seedSettings() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const steps: string[] = [];
  try {
    await client.query("BEGIN");

    await client.query(SCHEMA_SQL);
    steps.push("additive schema ensured (clinic_hours, clinic_info, services.duration/price)");

    for (const h of DEFAULT_CLINIC_HOURS) {
      await client.query(
        `INSERT INTO clinic_hours (day, open_time, close_time, enabled) VALUES ($1,$2,$3,$4)
         ON CONFLICT (day) DO NOTHING`,
        [h.day, h.open, h.close, h.enabled],
      );
    }
    steps.push("seeded default clinic hours");

    await client.query(
      `INSERT INTO clinic_info (id, name, phone, email, address) VALUES (1,$1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING`,
      ["Ayag Dental Clinic", "(02) 8123-4567", "info@ayagdental.com", "123 Health St, Manila"],
    );
    steps.push("seeded default clinic info");

    let seededServices = 0;
    for (const s of DEFAULT_SERVICES) {
      const existing = await client.query(`SELECT id, price, duration FROM services WHERE service_name = $1`, [s.name]);
      if (existing.rows.length === 0) {
        await client.query(`INSERT INTO services (service_name, duration, price) VALUES ($1,$2,$3)`, [s.name, s.duration, s.price]);
        seededServices++;
      } else if (existing.rows[0].price == null || existing.rows[0].duration == null) {
        await client.query(
          `UPDATE services SET duration = COALESCE(duration, $2), price = COALESCE(price, $3) WHERE id = $1`,
          [existing.rows[0].id, s.duration, s.price],
        );
        seededServices++;
      }
    }
    steps.push(`ensured pricing for ${seededServices} of ${DEFAULT_SERVICES.length} canonical service(s)`);

    await client.query("COMMIT");
    return steps;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function migrateV2() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const steps: string[] = [];
  try {
    await client.query("BEGIN");

    // 1. Ensure the additive schema (new tables/columns) is present.
    await client.query(SCHEMA_SQL);
    steps.push("additive schema ensured");

    // 2. Drop dental_records columns that FK to users — not needed to migrate procedure/prescription,
    //    and removing them now avoids any FK interaction with the users patient-row cleanup below.
    await client.query(`ALTER TABLE dental_records DROP COLUMN IF EXISTS patient_id`);
    await client.query(`ALTER TABLE dental_records DROP COLUMN IF EXISTS dentist_id`);
    steps.push("dropped dental_records.patient_id / dentist_id");

    // 3. Drop tables being removed entirely (dead/unused, or replaced by the audit-free design).
    await client.query(`DROP TABLE IF EXISTS sales`);
    await client.query(`DROP TABLE IF EXISTS queue_entries`);
    await client.query(`DROP TABLE IF EXISTS dental_record_audits`);
    steps.push("dropped sales / queue_entries / dental_record_audits");

    // 4. Copy role='patient' users into patients, preserving id so existing FK values stay valid.
    const patientUsers = await client.query(`
      SELECT u.id, u.email, u.password_hash, u.name, u.verified, u.created_at,
             pp.phone, pp.address, pp.age, pp.gender, pp.blood_type, pp.allergies,
             pp.status, pp.last_login, pp.archived_at, pp.archived_by
      FROM users u
      LEFT JOIN patient_profiles pp ON pp.user_id = u.id
      WHERE u.role = 'patient'
    `);
    for (const row of patientUsers.rows) {
      const { firstName, lastName } = splitName(row.name ?? row.email);
      await client.query(
        `INSERT INTO patients (id, first_name, last_name, sex, age, address, contact_number, email, password_hash, status, blood_type, allergies, verified, last_login, archived_at, archived_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, firstName, lastName, row.gender, row.age, row.address, row.phone, row.email, row.password_hash,
         row.status ?? "active", row.blood_type, row.allergies, row.verified, row.last_login, row.archived_at, row.archived_by, row.created_at],
      );
    }
    steps.push(`migrated ${patientUsers.rows.length} patient user(s) into patients`);

    // 5. Repoint appointments.patient_id from users to patients (drop old FK before removing the
    //    referenced user rows, so ON DELETE SET NULL doesn't fire and blank out real appointment data).
    await client.query(`
      DO $$
      DECLARE con text;
      BEGIN
        SELECT conname INTO con FROM pg_constraint
        WHERE conrelid = 'appointments'::regclass AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE '%patient_id%users%';
        IF con IS NOT NULL THEN
          EXECUTE format('ALTER TABLE appointments DROP CONSTRAINT %I', con);
        END IF;
      END $$;
    `);
    steps.push("dropped old appointments.patient_id -> users FK");

    // 6. Now safe to remove patient rows from users.
    const deleted = await client.query(`DELETE FROM users WHERE role = 'patient'`);
    steps.push(`deleted ${deleted.rowCount} patient row(s) from users`);

    // 7. Add the new FK: appointments.patient_id -> patients(id).
    await client.query(`ALTER TABLE appointments ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL`);
    steps.push("added appointments.patient_id -> patients FK");

    // 8. Backfill first_name/last_name for remaining staff users, drop name, narrow role CHECK.
    const staffUsers = await client.query(`SELECT id, name FROM users WHERE first_name IS NULL`);
    for (const row of staffUsers.rows) {
      const { firstName, lastName } = splitName(row.name ?? "Staff");
      await client.query(`UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3`, [firstName, lastName, row.id]);
    }
    await client.query(`ALTER TABLE users ALTER COLUMN first_name SET NOT NULL`);
    await client.query(`ALTER TABLE users ALTER COLUMN last_name SET NOT NULL`);
    await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS name`);
    await client.query(`
      DO $$
      DECLARE con text;
      BEGIN
        SELECT conname INTO con FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%role%';
        IF con IS NOT NULL THEN
          EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', con);
        END IF;
      END $$;
    `);
    await client.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','dentist','superadmin'))`);
    steps.push(`backfilled names for ${staffUsers.rows.length} staff user(s); narrowed role check`);

    // 9. Migrate dental_records.procedure/.prescription into services/treatments/prescriptions.
    const recordRows = await client.query(`SELECT id, procedure, prescription FROM dental_records`);
    const serviceIdByName = new Map<string, string>();
    for (const r of recordRows.rows) {
      const procedureName = (r.procedure ?? "").trim();
      if (procedureName) {
        let serviceId = serviceIdByName.get(procedureName);
        if (!serviceId) {
          const existing = await client.query(`SELECT id FROM services WHERE service_name = $1`, [procedureName]);
          if (existing.rows.length > 0) {
            serviceId = existing.rows[0].id;
          } else {
            const inserted = await client.query(
              `INSERT INTO services (name, service_name) VALUES ($1,$1) RETURNING id`,
              [procedureName],
            );
            serviceId = inserted.rows[0].id;
          }
          serviceIdByName.set(procedureName, serviceId!);
        }
        await client.query(`INSERT INTO treatments (record_id, service_id) VALUES ($1,$2)`, [r.id, serviceId]);
      }
      const prescriptionText = (r.prescription ?? "").trim();
      if (prescriptionText) {
        await client.query(`INSERT INTO prescriptions (record_id, medicine) VALUES ($1,$2)`, [r.id, prescriptionText]);
      }
    }
    steps.push(`migrated treatments/prescriptions for ${recordRows.rows.length} dental record(s)`);

    // 10. Drop the now-obsolete free-text columns on dental_records.
    await client.query(`ALTER TABLE dental_records DROP COLUMN IF EXISTS patient_name`);
    await client.query(`ALTER TABLE dental_records DROP COLUMN IF EXISTS dentist_name`);
    await client.query(`ALTER TABLE dental_records DROP COLUMN IF EXISTS service`);
    await client.query(`ALTER TABLE dental_records DROP COLUMN IF EXISTS procedure`);
    await client.query(`ALTER TABLE dental_records DROP COLUMN IF EXISTS prescription`);
    steps.push("dropped obsolete dental_records text columns");

    // 11. Enforce dental_records.appointment_id NOT NULL only if every row already has one.
    const nullApptCount = await client.query(`SELECT COUNT(*)::int AS c FROM dental_records WHERE appointment_id IS NULL`);
    if (nullApptCount.rows[0].c === 0) {
      await client.query(`ALTER TABLE dental_records ALTER COLUMN appointment_id SET NOT NULL`);
      steps.push("enforced dental_records.appointment_id NOT NULL");
    } else {
      steps.push(`WARNING: ${nullApptCount.rows[0].c} dental record(s) have no appointment_id — left nullable, needs manual review`);
    }

    // 12. Drop old profile tables and other dead tables.
    await client.query(`DROP TABLE IF EXISTS patient_profiles`);
    await client.query(`DROP TABLE IF EXISTS staff_profiles`);
    await client.query(`DROP TABLE IF EXISTS clinic_hours`);
    await client.query(`DROP TABLE IF EXISTS inventory_items`);
    steps.push("dropped patient_profiles / staff_profiles / clinic_hours / inventory_items");

    // 13. Recreate dentist scheduling tables in the diagram's per-day-of-week shape (unused by any
    //     API today, so this is a zero-data-risk schema-only swap).
    await client.query(`DROP TABLE IF EXISTS dentist_unavailable_dates`);
    await client.query(`DROP TABLE IF EXISTS dentist_schedules`);
    await client.query(`
      CREATE TABLE dentist_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        lunch_start TEXT,
        lunch_end TEXT,
        duration_minutes INTEGER NOT NULL DEFAULT 30,
        max_patient INTEGER NOT NULL DEFAULT 20,
        UNIQUE (dentist_id, day_of_week)
      )
    `);
    await client.query(`
      CREATE TABLE dentist_unavailable (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        unavailable_date DATE NOT NULL,
        reason TEXT,
        remarks TEXT
      )
    `);
    steps.push("recreated dentist_schedules / dentist_unavailable in new shape");

    // 14. Finalize services table shape.
    await client.query(`UPDATE services SET service_name = name WHERE service_name IS NULL`);
    await client.query(`ALTER TABLE services ALTER COLUMN service_name SET NOT NULL`);
    await client.query(`ALTER TABLE services DROP COLUMN IF EXISTS name`);
    await client.query(`ALTER TABLE services DROP COLUMN IF EXISTS duration`);
    await client.query(`ALTER TABLE services DROP COLUMN IF EXISTS price`);
    steps.push("finalized services table shape");

    await client.query("COMMIT");
    return steps;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.MIGRATE_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const action = req.body?.action ?? req.query.action;
  try {
    if (action === "seed") {
      const created = await seed();
      return res.status(200).json({ ok: true, created });
    }
    if (action === "migrate") {
      await migrate();
      return res.status(200).json({ ok: true });
    }
    if (action === "migrate_v2") {
      const steps = await migrateV2();
      return res.status(200).json({ ok: true, steps });
    }
    if (action === "seed_settings") {
      const steps = await seedSettings();
      return res.status(200).json({ ok: true, steps });
    }
    return res.status(400).json({ error: "Missing or invalid action (expected 'migrate', 'migrate_v2', 'seed_settings' or 'seed')" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
