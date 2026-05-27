-- Migration: 032_add_expense_timetable_columns
-- Description: Adds fields used by expenses and the enhanced timetable editor.

ALTER TABLE IF EXISTS expenses
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

ALTER TABLE IF EXISTS timetable
  ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'class',
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_name TEXT;

