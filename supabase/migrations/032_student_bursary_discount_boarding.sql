-- Persist student-targeted finance adjustments and day/boarding status.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS boarding_status VARCHAR(20) DEFAULT 'day';

ALTER TABLE bursaries
  ADD COLUMN IF NOT EXISTS is_full BOOLEAN DEFAULT FALSE;

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS student_name VARCHAR(200);

ALTER TABLE discounts
  ALTER COLUMN class_id DROP NOT NULL,
  ALTER COLUMN class_name DROP NOT NULL;
