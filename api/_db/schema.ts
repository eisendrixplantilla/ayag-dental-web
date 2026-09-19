export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'patient', 'superadmin', 'dentist')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archived_by TEXT
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  contact TEXT,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  joined TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  archived_by TEXT
);

CREATE TABLE IF NOT EXISTS dentist_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  working_days INTEGER[] NOT NULL DEFAULT '{}',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  lunch_start TEXT,
  lunch_end TEXT,
  duration INTEGER NOT NULL DEFAULT 30,
  max_patients_per_day INTEGER NOT NULL DEFAULT 20,
  UNIQUE (dentist_id)
);

CREATE TABLE IF NOT EXISTS dentist_unavailable_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES dentist_schedules(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Vacation Leave', 'Sick Leave', 'Holiday', 'Emergency Leave')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  duration INTEGER NOT NULL,
  price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS clinic_hours (
  day TEXT PRIMARY KEY,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
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

CREATE TABLE IF NOT EXISTS dental_record_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES dental_records(id) ON DELETE CASCADE,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  changes TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'in-stock'
);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  patient_name TEXT,
  service TEXT,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number INTEGER NOT NULL,
  patient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  patient_name TEXT,
  service TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  type TEXT NOT NULL DEFAULT 'walk-in',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_dentist ON appointments(dentist_id);
CREATE INDEX IF NOT EXISTS idx_dental_records_patient ON dental_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_sales_patient ON sales(patient_id);
`;
