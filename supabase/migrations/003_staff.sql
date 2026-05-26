-- =====================================================
-- Migration: 003_staff
-- Description: Create staff table
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
  custom_fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_staff_school_id ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);

ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
