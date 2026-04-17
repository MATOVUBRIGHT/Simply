-- =====================================================
-- SCHOFY SUPABASE MIGRATIONS
-- Run this file in the Supabase SQL Editor
-- https://supabase.com/dashboard/project/<your-project-ref>/sql
-- =====================================================

-- =====================================================
-- MIGRATION 001: Initial Setup
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(100),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  logo_url TEXT,
  settings JSONB DEFAULT '{"currency": "USD", "currencySymbol": "$", "dateFormat": "YYYY-MM-DD", "academicYearStart": 9, "termsPerYear": 3, "timezone": "UTC", "theme": "light", "primaryColor": "#6366f1"}',
  plan VARCHAR(50) DEFAULT 'free',
  max_students INTEGER DEFAULT 100,
  max_staff INTEGER DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE schools DISABLE ROW LEVEL SECURITY;

INSERT INTO schools (id, name, settings) 
VALUES ('00000000-0000-0000-0000-000000000001', 'My School', '{"currency": "USD", "currencySymbol": "$"}')
ON CONFLICT DO NOTHING;

-- =====================================================
-- MIGRATION 002: Students
-- =====================================================
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  student_id VARCHAR(100),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender VARCHAR(20) DEFAULT 'male',
  dob DATE,
  class_id UUID,
  stream VARCHAR(50),
  address TEXT,
  guardian_name VARCHAR(200),
  guardian_phone VARCHAR(50),
  guardian_email VARCHAR(255),
  medical_info TEXT,
  photo_url TEXT,
  status VARCHAR(20) DEFAULT 'active',
  admission_no VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

ALTER TABLE students DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 003: Staff
-- =====================================================
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  employee_id VARCHAR(100),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) DEFAULT 'teacher',
  department VARCHAR(100),
  dob DATE,
  gender VARCHAR(20),
  address TEXT,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  photo_url TEXT,
  salary DECIMAL(12,2),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_staff_school_id ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);

ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 004: Classes
-- =====================================================
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name VARCHAR(100) NOT NULL,
  level INTEGER DEFAULT 1,
  stream VARCHAR(50),
  capacity INTEGER DEFAULT 40,
  class_teacher_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_level ON classes(level);

ALTER TABLE classes DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_students_class'
  ) THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_class 
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- MIGRATION 005: Subjects
-- =====================================================
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_subjects_school_id ON subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_class_id ON subjects(class_id);

ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 006: Attendance
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  entity_type VARCHAR(20) NOT NULL,
  entity_id UUID NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  remarks TEXT,
  marked_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_attendance_school_id ON attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_entity ON attendance(entity_type, entity_id);

ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 007: Fees
-- =====================================================
CREATE TABLE IF NOT EXISTS fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  due_date DATE NOT NULL,
  term VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fees_school_id ON fees(school_id);
CREATE INDEX IF NOT EXISTS idx_fees_student_id ON fees(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_status ON fees(status);

ALTER TABLE fees DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  category VARCHAR(50) DEFAULT 'tuition',
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  term VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_school_id ON fee_structures(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class_id ON fee_structures(class_id);

ALTER TABLE fee_structures DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS bursaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  student_name VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  term VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE bursaries DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  class_name VARCHAR(100) NOT NULL,
  type VARCHAR(20) DEFAULT 'fixed',
  amount DECIMAL(12,2) NOT NULL,
  term VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE discounts DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 008: Payments
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  fee_id UUID REFERENCES fees(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  method VARCHAR(50) DEFAULT 'cash',
  reference VARCHAR(100),
  date DATE NOT NULL,
  recorded_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_school_id ON payments(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);

ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS salary_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  staff_name VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  month VARCHAR(7) NOT NULL,
  year INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE salary_payments DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  student_name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  term VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_school_id ON invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student_id ON invoices(student_id);

ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 009: Exams
-- =====================================================
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name VARCHAR(200) NOT NULL,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  term VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE exams DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS exam_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  grade VARCHAR(5),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE exam_results DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 010: Timetable
-- =====================================================
CREATE TABLE IF NOT EXISTS timetable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID,
  day_of_week INTEGER DEFAULT 0,
  period INTEGER DEFAULT 1,
  start_time TIME,
  end_time TIME,
  room VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE timetable DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 011: Transport
-- =====================================================
CREATE TABLE IF NOT EXISTS transport_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name VARCHAR(200) NOT NULL,
  vehicle_number VARCHAR(50),
  driver_name VARCHAR(200),
  driver_phone VARCHAR(50),
  pickup_points TEXT,
  fee DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE transport_routes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS transport_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  route_id UUID REFERENCES transport_routes(id) ON DELETE CASCADE,
  pickup_point VARCHAR(200),
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE transport_assignments DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 012: Announcements & Notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  type VARCHAR(20) DEFAULT 'general',
  target_audience VARCHAR(20) DEFAULT 'all',
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id UUID,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MIGRATION 013: Users
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

ALTER TABLE users DISABLE ROW LEVEL SECURITY;

INSERT INTO users (id, school_id, email, password_hash, role, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'admin@school.com', '$2a$10$abcdefghijklmnopqrstuv', 'admin', 'Admin', 'User')
ON CONFLICT DO NOTHING;

-- =====================================================
-- MIGRATION 014: Sync Logs
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  table_name VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  direction VARCHAR(10) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  local_data JSONB,
  remote_data JSONB,
  resolved_with VARCHAR(20),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_school_id ON sync_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);

-- =====================================================
-- MIGRATION 015: Updated At Triggers
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT t.tablename FROM pg_tables t
    WHERE t.schemaname = 'public' 
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' 
      AND c.table_name = t.tablename
      AND c.column_name = 'updated_at'
    )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', rec.tablename, rec.tablename);
    EXECUTE format(
      'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      rec.tablename, rec.tablename
    );
  END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 'Schema created successfully!' AS status;

-- List all created tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
