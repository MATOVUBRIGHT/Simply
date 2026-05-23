-- Migration: 027_allow_anon_app_sync
-- Description: Allow Schofy's table-based auth client to sync app data.
--
-- The app currently authenticates against public.users and writes through the
-- Supabase anon client. If RLS is enabled for these tables without anon write
-- policies, local records remain queued and Supabase tables stay empty.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  table_name text;
  sync_tables text[] := ARRAY[
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
  FOREACH table_name IN ARRAY sync_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
