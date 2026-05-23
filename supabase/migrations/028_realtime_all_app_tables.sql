-- Migration: 028_realtime_all_app_tables
-- Description: Make all app data tables emit realtime changes, including deletes.
--
-- DELETE events need REPLICA IDENTITY FULL so filtered realtime payloads include
-- enough old-row data for each device to remove records immediately.

DO $$
DECLARE
  table_name text;
  sync_tables text[] := ARRAY[
    'schools',
    'subscriptions',
    'users',
    'plans',
    'students',
    'staff',
    'classes',
    'subjects',
    'attendance',
    'fees',
    'fee_structures',
    'payments',
    'salary_payments',
    'announcements',
    'notifications',
    'exams',
    'exam_results',
    'timetable',
    'transport_routes',
    'transport_assignments',
    'bursaries',
    'discounts',
    'invoices',
    'settings',
    'point_transactions',
    'inventory',
    'expenses',
    'audit_logs',
    'library_books',
    'library_issues',
    'homework',
    'behavior_logs',
    'parent_messages',
    'student_attendance',
    'staff_attendance',
    'exam_timetable',
    'lesson_plans',
    'student_resources',
    'hostel_rooms',
    'hostel_assignments',
    'events',
    'visitor_logs',
    'certificates'
  ];
BEGIN
  FOREACH table_name IN ARRAY sync_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;

      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', table_name);
    END IF;
  END LOOP;
END $$;
