-- =====================================================
-- Migration: 037_growth_performance_archives
-- Purpose: 10+ year growth indexes, archive tables, and archive helpers
-- =====================================================

-- Tenant/search indexes. Use CONCURRENTLY outside managed migration runners if needed.
CREATE INDEX IF NOT EXISTS idx_students_school_student_no ON students(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_students_school_admission_no ON students(school_id, admission_no);
CREATE INDEX IF NOT EXISTS idx_students_school_class_status ON students(school_id, class_id, status);
CREATE INDEX IF NOT EXISTS idx_students_school_guardian_phone ON students(school_id, guardian_phone);
CREATE INDEX IF NOT EXISTS idx_students_school_created_id ON students(school_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_staff_school_employee_id ON staff(school_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_staff_school_role_status ON staff(school_id, role, status);
CREATE INDEX IF NOT EXISTS idx_classes_school_teacher_id ON classes(school_id, class_teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_teacher_id ON subjects(school_id, teacher_id);

CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_school_entity_date ON attendance(school_id, entity_type, entity_id, date);

CREATE INDEX IF NOT EXISTS idx_fees_school_year_term_class ON fees(school_id, year, term, class_id);
CREATE INDEX IF NOT EXISTS idx_fees_school_student_year_term ON fees(school_id, student_id, year, term);
CREATE INDEX IF NOT EXISTS idx_fees_school_status ON fees(school_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_school_student_date ON payments(school_id, student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_school_fee_id ON payments(school_id, fee_id);
CREATE INDEX IF NOT EXISTS idx_payments_school_date ON payments(school_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_exams_school_class_year_term ON exams(school_id, class_id, year, term);
CREATE INDEX IF NOT EXISTS idx_exam_results_student_exam ON exam_results(student_id, exam_id);

CREATE TABLE IF NOT EXISTS academic_year_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid,
  academic_year text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  archived_at timestamptz,
  restored_at timestamptz,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, academic_year)
);

CREATE TABLE IF NOT EXISTS attendance_archive (LIKE attendance INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE attendance_archive ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE attendance_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS fees_archive (LIKE fees INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE fees_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS payments_archive (LIKE payments INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE payments_archive ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE payments_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_attendance_archive_school_year_date ON attendance_archive(school_id, academic_year, date);
CREATE INDEX IF NOT EXISTS idx_attendance_archive_school_entity_date ON attendance_archive(school_id, entity_type, entity_id, date);
CREATE INDEX IF NOT EXISTS idx_fees_archive_school_year_term ON fees_archive(school_id, year, term);
CREATE INDEX IF NOT EXISTS idx_fees_archive_school_student_year ON fees_archive(school_id, student_id, year);
CREATE INDEX IF NOT EXISTS idx_payments_archive_school_year_date ON payments_archive(school_id, academic_year, date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_archive_school_student_date ON payments_archive(school_id, student_id, date DESC);

CREATE OR REPLACE FUNCTION archive_academic_year(target_school_id uuid, target_year text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  attendance_count bigint;
  fee_count bigint;
  payment_count bigint;
BEGIN
  SELECT count(*) INTO attendance_count
  FROM attendance
  WHERE school_id = target_school_id AND left(date::text, 4) = target_year;

  SELECT count(*) INTO fee_count
  FROM fees
  WHERE school_id = target_school_id AND year = target_year::integer;

  SELECT count(*) INTO payment_count
  FROM payments
  WHERE school_id = target_school_id AND left(date::text, 4) = target_year;

  INSERT INTO academic_year_archives (school_id, academic_year, status, archived_at, record_counts)
  VALUES (
    target_school_id,
    target_year,
    'archived',
    now(),
    jsonb_build_object('attendance', attendance_count, 'fees', fee_count, 'payments', payment_count)
  )
  ON CONFLICT (school_id, academic_year)
  DO UPDATE SET status = 'archived', archived_at = now(), updated_at = now(), record_counts = excluded.record_counts;

  INSERT INTO attendance_archive SELECT a.*, target_year, now()
  FROM attendance a
  WHERE a.school_id = target_school_id AND left(a.date::text, 4) = target_year
  ON CONFLICT DO NOTHING;
  DELETE FROM attendance WHERE school_id = target_school_id AND left(date::text, 4) = target_year;

  INSERT INTO fees_archive SELECT f.*, now()
  FROM fees f
  WHERE f.school_id = target_school_id AND f.year = target_year::integer
  ON CONFLICT DO NOTHING;
  DELETE FROM fees WHERE school_id = target_school_id AND year = target_year::integer;

  INSERT INTO payments_archive SELECT p.*, target_year, now()
  FROM payments p
  WHERE p.school_id = target_school_id AND left(p.date::text, 4) = target_year
  ON CONFLICT DO NOTHING;
  DELETE FROM payments WHERE school_id = target_school_id AND left(date::text, 4) = target_year;

  RETURN jsonb_build_object('attendance', attendance_count, 'fees', fee_count, 'payments', payment_count);
END;
$$;

CREATE OR REPLACE FUNCTION restore_academic_year(target_school_id uuid, target_year text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO attendance
  (id, school_id, entity_type, entity_id, date, status, remarks, marked_by, created_at, updated_at, deleted_at)
  SELECT id, school_id, entity_type, entity_id, date, status, remarks, marked_by, created_at, updated_at, deleted_at
  FROM attendance_archive
  WHERE school_id = target_school_id AND academic_year = target_year
  ON CONFLICT DO NOTHING;
  DELETE FROM attendance_archive WHERE school_id = target_school_id AND academic_year = target_year;

  INSERT INTO fees
  (id, school_id, student_id, class_id, description, amount, paid_amount, due_date, term, year, status, created_at, updated_at, deleted_at, is_required, fee_type)
  SELECT id, school_id, student_id, class_id, description, amount, paid_amount, due_date, term, year, status, created_at, updated_at, deleted_at, is_required, fee_type
  FROM fees_archive
  WHERE school_id = target_school_id AND year = target_year::integer
  ON CONFLICT DO NOTHING;
  DELETE FROM fees_archive WHERE school_id = target_school_id AND year = target_year::integer;

  INSERT INTO payments
  (id, school_id, fee_id, student_id, amount, method, reference, date, recorded_by, notes, created_at, updated_at, deleted_at, payment_type)
  SELECT id, school_id, fee_id, student_id, amount, method, reference, date, recorded_by, notes, created_at, updated_at, deleted_at, payment_type
  FROM payments_archive
  WHERE school_id = target_school_id AND academic_year = target_year
  ON CONFLICT DO NOTHING;
  DELETE FROM payments_archive WHERE school_id = target_school_id AND academic_year = target_year;

  UPDATE academic_year_archives
  SET status = 'restored', restored_at = now(), updated_at = now()
  WHERE school_id = target_school_id AND academic_year = target_year;
END;
$$;

-- For schools with tens of millions of rows, convert attendance/payments/fees to
-- RANGE partitions by academic year during a planned migration window. Keep the
-- same indexes on each child partition and route active-year writes to the
-- current partition.
