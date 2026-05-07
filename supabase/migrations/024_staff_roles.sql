-- Migration 024: Staff roles
-- Run this in Supabase SQL Editor

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
  generated_email TEXT,
  is_active BOOLEAN DEFAULT true,
  is_read_only BOOLEAN DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_ssu_school ON school_staff_users(school_id);
CREATE INDEX IF NOT EXISTS idx_ssu_gen_email ON school_staff_users(generated_email);

-- Add columns if table already exists (safe to run multiple times)
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS generated_email TEXT;
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN DEFAULT false;
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Add unique constraint on generated_email if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'school_staff_users_generated_email_key'
  ) THEN
    ALTER TABLE school_staff_users ADD CONSTRAINT school_staff_users_generated_email_key UNIQUE (generated_email);
  END IF;
END $$;

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

-- Disable RLS (use GRANT instead — simpler for anon key access)
ALTER TABLE school_staff_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_activity_log DISABLE ROW LEVEL SECURITY;

-- Grant full access to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE, DELETE ON school_staff_users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_activity_log TO anon, authenticated;

