-- Migration: 023_enable_realtime
-- Enable Supabase Realtime (Postgres Changes) on all app tables
-- Run this in Supabase SQL Editor

BEGIN;

-- Add tables to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE students;
ALTER PUBLICATION supabase_realtime ADD TABLE staff;
ALTER PUBLICATION supabase_realtime ADD TABLE classes;
ALTER PUBLICATION supabase_realtime ADD TABLE subjects;
ALTER PUBLICATION supabase_realtime ADD TABLE fees;
ALTER PUBLICATION supabase_realtime ADD TABLE fee_structures;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE salary_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE exams;
ALTER PUBLICATION supabase_realtime ADD TABLE exam_results;
ALTER PUBLICATION supabase_realtime ADD TABLE transport_routes;
ALTER PUBLICATION supabase_realtime ADD TABLE transport_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE bursaries;
ALTER PUBLICATION supabase_realtime ADD TABLE discounts;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;

COMMIT;
