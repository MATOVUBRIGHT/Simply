-- Migration 024: Staff roles
CREATE TABLE IF NOT EXISTS school_staff_users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL, staff_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'teacher', email TEXT, phone TEXT, password_hash TEXT NOT NULL, allowed_pages JSONB DEFAULT '[]', is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(school_id, staff_id));
CREATE INDEX IF NOT EXISTS idx_ssu_school ON school_staff_users(school_id);
CREATE TABLE IF NOT EXISTS staff_activity_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), school_id UUID NOT NULL, staff_user_id TEXT, staff_id TEXT, action TEXT NOT NULL, description TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_sal_school ON staff_activity_log(school_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON school_staff_users TO anon;
GRANT SELECT, INSERT ON staff_activity_log TO anon;
