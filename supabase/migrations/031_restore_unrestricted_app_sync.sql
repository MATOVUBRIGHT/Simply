-- Migration: 031_restore_unrestricted_app_sync
-- Description: Restore unrestricted app-table access for Schofy anon/auth clients.
--
-- This intentionally disables row-level security on app sync tables so existing
-- web and desktop builds can sign in, create profiles, and sync data without RLS
-- policy blocks.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  table_name text;
  app_tables text[] := ARRAY[
    'schools',
    'users',
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
    'profiles',
    'follows',
    'messages',
    'subscriptions',
    'point_transactions',
    'instructors',
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
    'certificates',
    'plans',
    'sync_logs',
    'admin_messages',
    'school_staff_users',
    'staff_activity_log'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
