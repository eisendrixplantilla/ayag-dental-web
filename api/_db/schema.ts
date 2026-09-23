// Additive-only DDL: safe to run at any time (used by action=migrate) and against a fresh,
// empty database. Destructive/transformative steps (dropping old columns/tables, moving data
// out of `users` into `patients`) live in the one-shot action=migrate_v2 in api/admin/db.ts.
export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS (staff only: admin/dentist/superadmin, once migrate_v2 has run)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'patient', 'superadmin', 'dentist')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
-- Why a staff account was archived, recorded at the moment it is archived and cleared on restore.
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'reset')),
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  pending_name TEXT,
  pending_password_hash TEXT,
  pending_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_purpose ON otp_codes(email, purpose);
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS pending_first_name TEXT;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS pending_middle_name TEXT;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS pending_last_name TEXT;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS pending_birthdate DATE;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS pending_sex TEXT;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS pending_address TEXT;
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS pending_contact_number TEXT;

-- PATIENTS (fully separate auth table, split out of users by migrate_v2)
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  birthdate DATE,
  sex TEXT,
  age INTEGER,
  address TEXT,
  contact_number TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  blood_type TEXT,
  allergies TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- SERVICES (repurposed: was unused with a name/duration/price shape, now service_name/description)
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  duration INTEGER,
  price NUMERIC(10, 2)
);
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_name TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE services ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2);

CREATE TABLE IF NOT EXISTS clinic_hours (
  day TEXT PRIMARY KEY,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- CLINIC_INFO: singleton row (id always 1) for clinic name/contact/address shown in Settings.
CREATE TABLE IF NOT EXISTS clinic_info (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Ayag Dental Clinic',
  phone TEXT,
  email TEXT,
  address TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  dentist_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dentist_name TEXT,
  service TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('online', 'walk-in')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rejected', 'rescheduled')),
  reason TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_time TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS dental_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  dentist_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dentist_name TEXT,
  date DATE NOT NULL,
  service TEXT,
  procedure TEXT,
  diagnosis TEXT,
  tooth_number TEXT,
  treatment_notes TEXT,
  prescription TEXT,
  next_visit DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE dental_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- TREATMENTS / PRESCRIPTIONS: normalized out of dental_records.procedure / .prescription
CREATE TABLE IF NOT EXISTS treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES dental_records(id) ON DELETE CASCADE,
  service_id UUID REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES dental_records(id) ON DELETE CASCADE,
  medicine TEXT NOT NULL,
  dosage TEXT,
  instructions TEXT
);

-- DENTIST_SCHEDULES / DENTIST_UNAVAILABLE: one row per working day-of-week per dentist,
-- plus a separate list of specific dates the dentist is unavailable. Already created live via
-- the one-shot migrate_v2 in this exact shape; declared here (IF NOT EXISTS) so a fresh
-- database bootstraps the same tables via action=migrate.
CREATE TABLE IF NOT EXISTS dentist_schedules (
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
);

CREATE TABLE IF NOT EXISTS dentist_unavailable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unavailable_date DATE NOT NULL,
  reason TEXT,
  remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_dentist ON appointments(dentist_id);
CREATE INDEX IF NOT EXISTS idx_dental_records_appointment ON dental_records(appointment_id);
CREATE INDEX IF NOT EXISTS idx_treatments_record ON treatments(record_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_record ON prescriptions(record_id);
CREATE INDEX IF NOT EXISTS idx_dentist_schedules_dentist ON dentist_schedules(dentist_id);
CREATE INDEX IF NOT EXISTS idx_dentist_unavailable_dentist ON dentist_unavailable(dentist_id);
`;
