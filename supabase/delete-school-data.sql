-- =====================================================
-- SCHOFY: DELETE ALL SCHOOL DATA
-- Paste this into Supabase SQL Editor.
--
-- Safety:
-- 1. Run the PREVIEW section first.
-- 2. To actually delete, set confirm_text to DELETE_SCHOOL_DATA.
-- 3. Keep confirm_text as DRY_RUN if you only want counts.
--
-- This deletes app school data from public tables.
-- It does not drop tables, functions, policies, or schema.
-- =====================================================

-- =====================================================
-- PREVIEW: count rows that would be deleted
-- =====================================================
DO $$
DECLARE
  table_name text;
  row_count bigint;
  school_tables text[] := ARRAY[
    'library_issues',
    'hostel_assignments',
    'certificates',
    'student_resources',
    'lesson_plans',
    'exam_timetable',
    'staff_attendance',
    'student_attendance',
    'parent_messages',
    'behavior_logs',
    'library_books',
    'audit_logs',
    'expenses',
    'inventory',
    'timetable',
    'invoices',
    'discounts',
    'bursaries',
    'transport_assignments',
    'transport_routes',
    'exam_results',
    'exams',
    'attendance',
    'notifications',
    'salary_payments',
    'payments',
    'fee_structures',
    'fees',
    'subjects',
    'classes',
    'staff',
    'students',
    'announcements',
    'settings',
    'subscriptions',
    'users',
    'events',
    'visitor_logs',
    'schools'
  ];
BEGIN
  RAISE NOTICE 'Previewing school data rows...';

  FOREACH table_name IN ARRAY school_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = table_name
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO row_count;
      RAISE NOTICE '%: % row(s)', table_name, row_count;
    ELSE
      RAISE NOTICE '%: table does not exist, skipped', table_name;
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- DELETE: guarded destructive cleanup
-- =====================================================
DO $$
DECLARE
  confirm_text text := 'DRY_RUN'; -- Change to DELETE_SCHOOL_DATA to execute.
  table_name text;
  deleted_count bigint;
  school_tables text[] := ARRAY[
    -- Child/dependent tables first
    'library_issues',
    'hostel_assignments',
    'certificates',
    'student_resources',
    'lesson_plans',
    'exam_timetable',
    'staff_attendance',
    'student_attendance',
    'parent_messages',
    'behavior_logs',
    'library_books',
    'audit_logs',
    'expenses',
    'inventory',
    'timetable',
    'invoices',
    'discounts',
    'bursaries',
    'transport_assignments',
    'transport_routes',
    'exam_results',
    'exams',
    'attendance',
    'notifications',
    'salary_payments',
    'payments',
    'fee_structures',
    'fees',
    'subjects',
    'classes',
    'staff',
    'students',
    'announcements',
    'settings',
    'subscriptions',
    'users',
    'events',
    'visitor_logs',
    -- Parent table last
    'schools'
  ];
BEGIN
  IF confirm_text <> 'DELETE_SCHOOL_DATA' THEN
    RAISE EXCEPTION 'Not deleting. Set confirm_text to DELETE_SCHOOL_DATA to continue.';
  END IF;

  FOREACH table_name IN ARRAY school_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = table_name
    ) THEN
      EXECUTE format('DELETE FROM public.%I', table_name);
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      RAISE NOTICE 'Deleted % row(s) from %', deleted_count, table_name;
    ELSE
      RAISE NOTICE '% does not exist, skipped', table_name;
    END IF;
  END LOOP;

  RAISE NOTICE 'School data cleanup complete.';
END $$;

-- =====================================================
-- OPTIONAL: delete Supabase Auth users
-- Uncomment only if you want to remove login accounts too.
--
-- DELETE FROM auth.users;
-- =====================================================

-- =====================================================
-- OPTIONAL: delete global plans
-- Usually keep this if your app needs seeded plan definitions.
--
-- DELETE FROM public.plans;
-- =====================================================
