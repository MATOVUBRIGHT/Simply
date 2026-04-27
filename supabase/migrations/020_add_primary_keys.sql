-- Migration: 020_add_primary_keys
-- Description: Add PRIMARY KEY constraints to tables (skip if already exists)

-- Classes table
DO $$ BEGIN
  ALTER TABLE IF EXISTS classes ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Students table  
DO $$ BEGIN
  ALTER TABLE IF EXISTS students ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Staff table
DO $$ BEGIN
  ALTER TABLE IF EXISTS staff ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Subjects table
DO $$ BEGIN
  ALTER TABLE IF EXISTS subjects ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Attendance table
DO $$ BEGIN
  ALTER TABLE IF EXISTS attendance ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Fees table
DO $$ BEGIN
  ALTER TABLE IF EXISTS fees ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Fee structures table
DO $$ BEGIN
  ALTER TABLE IF EXISTS fee_structures ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Bursaries table
DO $$ BEGIN
  ALTER TABLE IF EXISTS bursaries ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Discounts table
DO $$ BEGIN
  ALTER TABLE IF EXISTS discounts ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Payments table
DO $$ BEGIN
  ALTER TABLE IF EXISTS payments ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Salary payments table
DO $$ BEGIN
  ALTER TABLE IF EXISTS salary_payments ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Invoices table
DO $$ BEGIN
  ALTER TABLE IF EXISTS invoices ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Exams table
DO $$ BEGIN
  ALTER TABLE IF EXISTS exams ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Exam results table
DO $$ BEGIN
  ALTER TABLE IF EXISTS exam_results ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Timetable table
DO $$ BEGIN
  ALTER TABLE IF EXISTS timetable ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Transport routes table
DO $$ BEGIN
  ALTER TABLE IF EXISTS transport_routes ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Transport assignments table
DO $$ BEGIN
  ALTER TABLE IF EXISTS transport_assignments ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Announcements table
DO $$ BEGIN
  ALTER TABLE IF EXISTS announcements ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Notifications table
DO $$ BEGIN
  ALTER TABLE IF EXISTS notifications ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Settings table
DO $$ BEGIN
  ALTER TABLE IF EXISTS settings ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Profiles table
DO $$ BEGIN
  ALTER TABLE IF EXISTS profiles ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Follows table
DO $$ BEGIN
  ALTER TABLE IF EXISTS follows ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Messages table
DO $$ BEGIN
  ALTER TABLE IF EXISTS messages ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Subscriptions table
DO $$ BEGIN
  ALTER TABLE IF EXISTS subscriptions ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Point transactions table
DO $$ BEGIN
  ALTER TABLE IF EXISTS point_transactions ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Instructors table
DO $$ BEGIN
  ALTER TABLE IF EXISTS instructors ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Users table
DO $$ BEGIN
  ALTER TABLE IF EXISTS users ADD PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;
