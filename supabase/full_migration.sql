-- =====================================================
-- SCHOFY FULL DATABASE MIGRATION
-- Combined from migrations 001 to 024
-- =====================================================

-- 001_initial_setup.sql
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

-- 002_students.sql
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

-- 003_staff.sql
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
  custom_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_school_id ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- 004_classes.sql
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

-- 005_subjects.sql
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

-- 006_attendance.sql
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

-- 007_fees.sql
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

-- 008_payments.sql
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

-- 009_exams.sql
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

-- 010_timetable.sql
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

-- 011_transport.sql
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

-- 012_announcements.sql
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

-- 013_users.sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
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
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public registration' AND tablename = 'users') THEN
    CREATE POLICY "Allow public registration" ON users FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read' AND tablename = 'users') THEN
    CREATE POLICY "Allow public read" ON users FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated update' AND tablename = 'users') THEN
    CREATE POLICY "Allow authenticated update" ON users FOR UPDATE TO anon USING (true);
  END IF;
END $$;

-- 014_sync_logs.sql
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

-- 015_finalize.sql & 016_sync_triggers.sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'schools', 'students', 'staff', 'classes', 'subjects', 'attendance', 'fees',
    'fee_structures', 'bursaries', 'discounts', 'payments', 'salary_payments',
    'invoices', 'exams', 'exam_results', 'timetable', 'transport_routes',
    'transport_assignments', 'announcements', 'notifications', 'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tr_update_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER tr_update_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END;
$$;

-- 017_database_optimizations.sql
CREATE INDEX IF NOT EXISTS idx_students_admission_no ON students(admission_no);
CREATE INDEX IF NOT EXISTS idx_students_created_at ON students(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_entity_id ON attendance(entity_id);
CREATE INDEX IF NOT EXISTS idx_attendance_entity_type_date ON attendance(entity_type, date);
CREATE INDEX IF NOT EXISTS idx_fees_term_year ON fees(term, year);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student_id ON exam_results(student_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority);
CREATE INDEX IF NOT EXISTS idx_timetable_day_period ON timetable(day_of_week, period);
CREATE INDEX IF NOT EXISTS idx_transport_assignments_student_id ON transport_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_transport_assignments_route_id ON transport_assignments(route_id);
CREATE INDEX IF NOT EXISTS idx_attendance_entity_date ON attendance(entity_id, date);
CREATE INDEX IF NOT EXISTS idx_fees_student_term_year ON fees(student_id, term, year);
CREATE INDEX IF NOT EXISTS idx_students_class_status ON students(class_id, status);

-- 018_sync_reliability.sql
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_settings_school_key UNIQUE (school_id, key)
);
CREATE INDEX IF NOT EXISTS idx_settings_school_id ON settings(school_id);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  user_id UUID NOT NULL,
  display_name VARCHAR(200),
  avatar_url TEXT,
  bio TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_profiles_user UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_follows_pair UNIQUE (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_school_id ON follows(school_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
ALTER TABLE follows DISABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  sender_id UUID NOT NULL,
  recipient_id UUID,
  conversation_id UUID,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_school_id ON messages(school_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  user_id UUID NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school_id ON subscriptions(school_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  user_id UUID NOT NULL,
  points INTEGER NOT NULL,
  direction VARCHAR(10) NOT NULL,
  reason TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_point_transactions_direction CHECK (direction IN ('credit', 'debit'))
);
CREATE INDEX IF NOT EXISTS idx_point_transactions_school_id ON point_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions(created_at DESC);
ALTER TABLE point_transactions DISABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS instructors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL,
  staff_id UUID,
  employee_id VARCHAR(100),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) DEFAULT 'teacher',
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_instructors_school_id ON instructors(school_id);
CREATE INDEX IF NOT EXISTS idx_instructors_employee_id ON instructors(employee_id);
CREATE INDEX IF NOT EXISTS idx_instructors_status ON instructors(status);
ALTER TABLE instructors DISABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['settings','profiles','follows','messages','subscriptions','point_transactions','instructors'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- 019_users_tenant_school_id.sql
CREATE OR REPLACE FUNCTION public.users_set_school_id_to_user_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.school_id := NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_users_school_id_to_user_id ON public.users;
CREATE TRIGGER trg_users_school_id_to_user_id
  BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_set_school_id_to_user_id();

-- 020_add_primary_keys.sql (already mostly done in initial setup, but for safety)
DO $$ BEGIN
  ALTER TABLE IF EXISTS classes ADD PRIMARY KEY (id); EXCEPTION WHEN others THEN NULL;
END $$;
-- ... (other primary keys already ensured in CREATE TABLE statements above)

-- 021_add_missing_columns.sql
ALTER TABLE IF EXISTS fee_structures ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS fee_structures ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE IF EXISTS announcements ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) DEFAULT 'fee';
ALTER TABLE IF EXISTS fees ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;

-- 022_add_app_columns.sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS tuition_fee DECIMAL(12,2);
ALTER TABLE students ADD COLUMN IF NOT EXISTS boarding_fee DECIMAL(12,2);
ALTER TABLE students ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]';
ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]';
ALTER TABLE students ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE students ADD COLUMN IF NOT EXISTS completed_term VARCHAR(20);
ALTER TABLE students ADD COLUMN IF NOT EXISTS completed_year INTEGER;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS subjects JSONB DEFAULT '[]';
ALTER TABLE fees ADD COLUMN IF NOT EXISTS fee_type VARCHAR(50) DEFAULT 'tuition';
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS exam_type VARCHAR(50);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS student_name VARCHAR(200);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS class_id UUID;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(50);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS fee DECIMAL(12,2);
ALTER TABLE transport_assignments ADD COLUMN IF NOT EXISTS student_name VARCHAR(200);
ALTER TABLE transport_assignments ADD COLUMN IF NOT EXISTS route_name VARCHAR(100);

-- 023_enable_realtime.sql
-- (Requires publication to exist; standard Supabase practice)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'students', 'staff', 'classes', 'subjects', 'fees', 'fee_structures', 'payments',
    'salary_payments', 'announcements', 'notifications', 'attendance', 'exams',
    'exam_results', 'transport_routes', 'transport_assignments', 'bursaries',
    'discounts', 'invoices', 'settings'
  ];
BEGIN
  -- Create publication if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- 024_staff_roles.sql
CREATE TABLE IF NOT EXISTS school_staff_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  staff_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  allowed_pages JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  is_read_only BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS generated_email TEXT;
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN DEFAULT false;
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_staff_users_school_staff_unique') THEN
    ALTER TABLE school_staff_users ADD CONSTRAINT school_staff_users_school_staff_unique UNIQUE (school_id, staff_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ssu_school ON school_staff_users(school_id);
CREATE INDEX IF NOT EXISTS idx_ssu_gen_email ON school_staff_users(generated_email) WHERE generated_email IS NOT NULL;
CREATE TABLE IF NOT EXISTS staff_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  staff_user_id TEXT,
  staff_id TEXT,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sal_school ON staff_activity_log(school_id, created_at DESC);
ALTER TABLE school_staff_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_activity_log DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON school_staff_users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_activity_log TO anon, authenticated;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO anon, authenticated;

-- Final Cleanup: Ensure users table has correct school_id trigger
DROP TRIGGER IF EXISTS trg_users_school_id_to_user_id ON public.users;
CREATE TRIGGER trg_users_school_id_to_user_id
  BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_set_school_id_to_user_id();

SELECT 'Full migration completed successfully!' AS status;
