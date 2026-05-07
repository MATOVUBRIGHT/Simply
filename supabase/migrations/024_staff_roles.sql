-- Migration 024: Staff roles
-- Run this in Supabase SQL Editor (safe to run multiple times)

-- Step 1: Create table if it doesn't exist (without generated_email unique constraint)
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

-- Step 2: Add columns that may not exist yet (safe to run multiple times)
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS generated_email TEXT;
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN DEFAULT false;
ALTER TABLE school_staff_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Step 3: Add unique constraints (safe to run multiple times)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_staff_users_school_staff_unique') THEN
    ALTER TABLE school_staff_users ADD CONSTRAINT school_staff_users_school_staff_unique UNIQUE (school_id, staff_id);
  END IF;
END $$;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_ssu_school ON school_staff_users(school_id);
CREATE INDEX IF NOT EXISTS idx_ssu_gen_email ON school_staff_users(generated_email) WHERE generated_email IS NOT NULL;

-- Step 5: Activity log table
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

-- Step 6: Disable RLS so anon key can access (no auth required for staff login)
ALTER TABLE school_staff_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_activity_log DISABLE ROW LEVEL SECURITY;

-- Step 7: Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON school_staff_users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_activity_log TO anon, authenticated;

-- Step 8: Fix settings table 500 error (ensure anon can read settings)
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO anon, authenticated;

