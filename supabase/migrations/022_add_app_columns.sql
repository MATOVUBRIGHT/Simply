-- Migration: 022_add_app_columns
-- Adds all columns the app sends that are missing from the schema

-- students: extra app fields
ALTER TABLE students ADD COLUMN IF NOT EXISTS tuition_fee DECIMAL(12,2);
ALTER TABLE students ADD COLUMN IF NOT EXISTS boarding_fee DECIMAL(12,2);
ALTER TABLE students ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]';
ALTER TABLE students ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]';
ALTER TABLE students ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE students ADD COLUMN IF NOT EXISTS completed_term VARCHAR(20);
ALTER TABLE students ADD COLUMN IF NOT EXISTS completed_year INTEGER;

-- staff: extra app fields
ALTER TABLE staff ADD COLUMN IF NOT EXISTS subjects JSONB DEFAULT '[]';

-- announcements: created_by (app sends this)
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);

-- fees: is_required already in 021, add fee_type
ALTER TABLE fees ADD COLUMN IF NOT EXISTS fee_type VARCHAR(50) DEFAULT 'tuition';

-- payments: payment_type already in 021
-- salary_payments: no extra needed

-- exam_results: exam_type
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS exam_type VARCHAR(50);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS student_name VARCHAR(200);
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS class_id UUID;

-- transport_routes: extra fields
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(50);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(50);
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS fee DECIMAL(12,2);

-- transport_assignments: extra fields  
ALTER TABLE transport_assignments ADD COLUMN IF NOT EXISTS student_name VARCHAR(200);
ALTER TABLE transport_assignments ADD COLUMN IF NOT EXISTS route_name VARCHAR(100);
